import { expect } from "chai";
import { network } from "hardhat";
import type { BSideEscrow, BSideNFT } from "../types/ethers-contracts/index.js";

const { ethers, networkHelpers } = await network.getOrCreate();
const { time } = networkHelpers;

// BSideNFT.Policy
const PriceCap = 0;
const Royalty = 1;
const Free = 2;

// BSideEscrow.Status
const LISTED = 0n;
const LOCKED = 1n;
const COMPLETED = 2n;
const CANCELLED = 3n;
const DISPUTED = 4n;

// BSideEscrow.CancelReason
const SellerCancelled = 0;
const SellerRefunded = 1;
const DisputeRefunded = 2;

const URI = "ipfs://bafy-token-metadata"; // 단위 테스트용 임의 CID (IPFS 조회 안 함)
const CID = "bafy-condition-record";
const PRICE = ethers.parseEther("1");
const CONFIRM_PERIOD = 3n * 24n * 60n * 60n; // 3일

type Signer = Awaited<ReturnType<typeof ethers.getSigners>>[number];

async function deployFixture() {
  const [admin, artist, reseller, buyer, other, otherBuyer] = await ethers.getSigners();
  const nft = (await ethers.deployContract("BSideNFT", [admin.address])) as unknown as BSideNFT;
  const nftAddress = await nft.getAddress();
  const escrow = (await ethers.deployContract("BSideEscrow", [
    admin.address,
    nftAddress,
    CONFIRM_PERIOD,
  ])) as unknown as BSideEscrow;
  const escrowAddress = await escrow.getAddress();
  await nft.connect(admin).setEscrow(escrowAddress);
  await nft.connect(admin).grantRole(await nft.ARTIST_ROLE(), artist.address);
  return { nft, nftAddress, escrow, escrowAddress, admin, artist, reseller, buyer, other, otherBuyer };
}

type Ctx = Awaited<ReturnType<typeof deployFixture>>;

async function mint(ctx: Ctx, policy: number, bps: number, price = PRICE): Promise<bigint> {
  await ctx.nft.connect(ctx.artist).mint(URI, price, policy, bps);
  return ctx.nft.totalMinted();
}

/** approve 후 list. 생성된 거래 ID를 돌려준다. */
async function list(ctx: Ctx, seller: Signer, tokenId: bigint, price: bigint, cid = CID): Promise<bigint> {
  await ctx.nft.connect(seller).approve(ctx.escrowAddress, tokenId);
  await ctx.escrow.connect(seller).list(tokenId, price, cid);
  return ctx.escrow.listingCount();
}

async function getListing(ctx: Ctx, listingId: bigint) {
  const [view] = await ctx.escrow.getListings(listingId - 1n, 1n);
  return view.listing;
}

/** 아티스트의 최초 판매를 newOwner에게 완료시킨다 (이후 newOwner가 재판매자가 된다). */
async function completePrimarySale(ctx: Ctx, tokenId: bigint, newOwner: Signer): Promise<bigint> {
  const info = await ctx.nft.getTokenInfo(tokenId);
  const listingId = await list(ctx, ctx.artist, tokenId, info.initialPrice);
  await ctx.escrow.connect(newOwner).buy(listingId, { value: info.initialPrice });
  await ctx.escrow.connect(newOwner).confirmReceipt(listingId);
  return listingId;
}

/** 재판매 직전 상태: reseller가 tokenId를 보유 */
async function resaleReady(ctx: Ctx, policy: number, bps: number): Promise<bigint> {
  const tokenId = await mint(ctx, policy, bps);
  await completePrimarySale(ctx, tokenId, ctx.reseller);
  return tokenId;
}

/** 재판매 거래가 LOCKED 된 상태 (판매자: reseller, 구매자: buyer) */
async function lockedResale(ctx: Ctx, policy = Royalty, bps = 500, price = PRICE) {
  const tokenId = await resaleReady(ctx, policy, bps);
  const listingId = await list(ctx, ctx.reseller, tokenId, price);
  await ctx.escrow.connect(ctx.buyer).buy(listingId, { value: price });
  const lockedAt = (await getListing(ctx, listingId)).lockedAt;
  return { tokenId, listingId, deadline: lockedAt + CONFIRM_PERIOD };
}

/** 에스크로 잔액 ≥ 출금 대기액 합 + LOCKED·DISPUTED 거래 대금 합 (자금 보존 불변식) */
async function solvency(ctx: Ctx, accounts: string[]) {
  const balance = await ethers.provider.getBalance(ctx.escrowAddress);
  let pending = 0n;
  for (const a of new Set(accounts)) pending += await ctx.escrow.pendingWithdrawals(a);
  let held = 0n;
  for (const v of await ctx.escrow.getListings(0n, 1000n)) {
    if (v.listing.status === LOCKED || v.listing.status === DISPUTED) held += v.listing.price;
  }
  return { balance, required: pending + held };
}

describe("BSideEscrow", () => {
  describe("배포", () => {
    it("관리자에게 관리자·중재자 권한을 부여하고 NFT 주소와 기한을 고정한다", async () => {
      const { escrow, admin, nftAddress } = await networkHelpers.loadFixture(deployFixture);
      expect(await escrow.hasRole(await escrow.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await escrow.hasRole(await escrow.ARBITER_ROLE(), admin.address)).to.equal(true);
      expect(await escrow.nft()).to.equal(nftAddress);
      expect(await escrow.confirmPeriod()).to.equal(CONFIRM_PERIOD);
    });

    it("0 주소 또는 기한 0으로는 배포할 수 없다", async () => {
      const { admin, nftAddress } = await networkHelpers.loadFixture(deployFixture);
      const factory = await ethers.getContractFactory("BSideEscrow");
      await expect(factory.deploy(ethers.ZeroAddress, nftAddress, 1n)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddress",
      );
      await expect(factory.deploy(admin.address, ethers.ZeroAddress, 1n)).to.be.revertedWithCustomError(
        factory,
        "ZeroAddress",
      );
      await expect(factory.deploy(admin.address, nftAddress, 0n)).to.be.revertedWithCustomError(
        factory,
        "ZeroConfirmPeriod",
      );
    });

    it("ETH를 직접 보내면 거부된다 (receive/fallback 없음)", async () => {
      const { escrowAddress, other } = await networkHelpers.loadFixture(deployFixture);
      await expect(other.sendTransaction({ to: escrowAddress, value: 1n })).to.be.revert(ethers);
    });
  });

  describe("판매 등록 — 최초 판매 (D1, D9)", () => {
    it("아티스트가 최초 판매가로 등록하면 최초 판매 거래가 되고 NFT가 에스크로로 이동한다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Royalty, 500);
      await ctx.nft.connect(ctx.artist).approve(ctx.escrowAddress, tokenId);

      await expect(ctx.escrow.connect(ctx.artist).list(tokenId, PRICE, CID))
        .to.emit(ctx.escrow, "Listed")
        .withArgs(1n, tokenId, ctx.artist.address, PRICE, CID, true);

      const l = await getListing(ctx, 1n);
      expect(l.status).to.equal(LISTED);
      expect(l.isPrimary).to.equal(true);
      expect(l.seller).to.equal(ctx.artist.address);
      expect(l.conditionCID).to.equal(CID);
      expect(l.listedAt).to.be.greaterThan(0n);
      expect(await ctx.nft.ownerOf(tokenId)).to.equal(ctx.escrowAddress);
      expect(await ctx.nft.isPrimaryAvailable(tokenId)).to.equal(true);
    });

    it("최초 판매가와 다른 가격(높거나 낮음)은 거부된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Free, 0);
      await ctx.nft.connect(ctx.artist).approve(ctx.escrowAddress, tokenId);
      for (const price of [PRICE + 1n, PRICE - 1n]) {
        await expect(ctx.escrow.connect(ctx.artist).list(tokenId, price, CID))
          .to.be.revertedWithCustomError(ctx.escrow, "PrimaryPriceMismatch")
          .withArgs(PRICE, price);
      }
    });

    it("외부로 보냈다가 돌려받은 아티스트는 최초 판매가 아니라 재판매로 등록된다 (D9)", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, PriceCap, 12_000);
      await ctx.nft.connect(ctx.artist).transferFrom(ctx.artist.address, ctx.other.address, tokenId);
      await ctx.nft.connect(ctx.other).transferFrom(ctx.other.address, ctx.artist.address, tokenId);

      const resalePrice = (PRICE * 12_000n) / 10_000n; // 상한 120%
      const listingId = await list(ctx, ctx.artist, tokenId, resalePrice);
      expect((await getListing(ctx, listingId)).isPrimary).to.equal(false);
    });
  });

  describe("판매 등록 — 재판매 가격 규칙 (D3, D10)", () => {
    it("정가 보호형: 상한과 정확히 같은 가격은 허용, 1 wei 초과는 거부된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await resaleReady(ctx, PriceCap, 15_000);
      const cap = (PRICE * 15_000n) / 10_000n;
      await ctx.nft.connect(ctx.reseller).approve(ctx.escrowAddress, tokenId);

      await expect(ctx.escrow.connect(ctx.reseller).list(tokenId, cap + 1n, CID))
        .to.be.revertedWithCustomError(ctx.escrow, "PriceExceedsCap")
        .withArgs(cap, cap + 1n);
      await expect(ctx.escrow.connect(ctx.reseller).list(tokenId, cap, CID)).to.not.be.revert(ethers);
      expect((await getListing(ctx, 2n)).isPrimary).to.equal(false);
    });

    it("정가 보호형 100%: 최초 판매가 이하로만 재판매할 수 있다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await resaleReady(ctx, PriceCap, 10_000);
      await ctx.nft.connect(ctx.reseller).approve(ctx.escrowAddress, tokenId);
      await expect(ctx.escrow.connect(ctx.reseller).list(tokenId, PRICE + 1n, CID)).to.be.revertedWithCustomError(
        ctx.escrow,
        "PriceExceedsCap",
      );
      await expect(ctx.escrow.connect(ctx.reseller).list(tokenId, PRICE / 2n, CID)).to.not.be.revert(ethers);
    });

    it("창작자 상생형·자유 거래형은 가격 상한이 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const big = PRICE * 1000n;
      for (const [policy, bps] of [
        [Royalty, 1_000],
        [Free, 0],
      ]) {
        const tokenId = await resaleReady(ctx, policy, bps);
        await expect(list(ctx, ctx.reseller, tokenId, big)).to.not.be.revert(ethers);
      }
    });

    it("아티스트가 최초 판매 후 다시 얻어 팔 때도 상한이 적용된다 (D10)", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await resaleReady(ctx, PriceCap, 12_000);
      await ctx.nft.connect(ctx.reseller).transferFrom(ctx.reseller.address, ctx.artist.address, tokenId);

      const cap = (PRICE * 12_000n) / 10_000n;
      await ctx.nft.connect(ctx.artist).approve(ctx.escrowAddress, tokenId);
      await expect(ctx.escrow.connect(ctx.artist).list(tokenId, cap + 1n, CID)).to.be.revertedWithCustomError(
        ctx.escrow,
        "PriceExceedsCap",
      );
      await ctx.escrow.connect(ctx.artist).list(tokenId, cap, CID);
      expect((await getListing(ctx, await ctx.escrow.listingCount())).isPrimary).to.equal(false);
    });

    it("가격 0은 거부된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await resaleReady(ctx, Free, 0);
      await ctx.nft.connect(ctx.reseller).approve(ctx.escrowAddress, tokenId);
      await expect(ctx.escrow.connect(ctx.reseller).list(tokenId, 0n, CID)).to.be.revertedWithCustomError(
        ctx.escrow,
        "ZeroPrice",
      );
    });
  });

  describe("판매 등록 — 거부 조건", () => {
    it("NFT 소유자가 아니면 등록할 수 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Free, 0);
      await expect(ctx.escrow.connect(ctx.other).list(tokenId, PRICE, CID)).to.be.revertedWithCustomError(
        ctx.escrow,
        "NotTokenOwner",
      );
    });

    it("approve 없이 등록하면 NFT 전송 단계에서 거부된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Free, 0);
      await expect(ctx.escrow.connect(ctx.artist).list(tokenId, PRICE, CID)).to.be.revertedWithCustomError(
        ctx.nft,
        "ERC721InsufficientApproval",
      );
    });

    it("상태 기록 CID가 비어 있으면 거부된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Free, 0);
      await ctx.nft.connect(ctx.artist).approve(ctx.escrowAddress, tokenId);
      await expect(ctx.escrow.connect(ctx.artist).list(tokenId, PRICE, "")).to.be.revertedWithCustomError(
        ctx.escrow,
        "EmptyConditionCID",
      );
    });

    it("같은 NFT를 두 번 등록할 수 없다 (에스크로가 보관 중)", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Free, 0);
      await list(ctx, ctx.artist, tokenId, PRICE);
      await expect(ctx.escrow.connect(ctx.artist).list(tokenId, PRICE, CID)).to.be.revertedWithCustomError(
        ctx.escrow,
        "NotTokenOwner",
      );
    });

    it("NFT에 등록되지 않은 에스크로로는 판매할 수 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Free, 0);
      const rogue = (await ethers.deployContract("BSideEscrow", [
        ctx.admin.address,
        ctx.nftAddress,
        CONFIRM_PERIOD,
      ])) as unknown as BSideEscrow;
      await ctx.nft.connect(ctx.artist).approve(await rogue.getAddress(), tokenId);
      await expect(rogue.connect(ctx.artist).list(tokenId, PRICE, CID)).to.be.revertedWithCustomError(
        rogue,
        "EscrowNotRegistered",
      );
    });

    it("에스크로로 NFT를 직접 보내는 것은 거부된다 (transferFrom·safeTransferFrom)", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Free, 0);
      await expect(
        ctx.nft.connect(ctx.artist).transferFrom(ctx.artist.address, ctx.escrowAddress, tokenId),
      ).to.be.revertedWithCustomError(ctx.nft, "DirectTransferToEscrow");
      await expect(
        ctx.nft
          .connect(ctx.artist)
          ["safeTransferFrom(address,address,uint256)"](ctx.artist.address, ctx.escrowAddress, tokenId),
      ).to.be.revertedWithCustomError(ctx.nft, "DirectTransferToEscrow");
    });
  });

  describe("판매 등록 취소 (LISTED → CANCELLED)", () => {
    it("판매자가 취소하면 NFT가 돌아오고, 아티스트의 최초 판매 자격은 유지된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Free, 0);
      const listingId = await list(ctx, ctx.artist, tokenId, PRICE);

      await expect(ctx.escrow.connect(ctx.artist).cancelListing(listingId))
        .to.emit(ctx.escrow, "Cancelled")
        .withArgs(listingId, tokenId, SellerCancelled);

      const l = await getListing(ctx, listingId);
      expect(l.status).to.equal(CANCELLED);
      expect(l.closedAt).to.be.greaterThan(0n);
      expect(await ctx.nft.ownerOf(tokenId)).to.equal(ctx.artist.address);
      expect(await ctx.nft.isPrimaryAvailable(tokenId)).to.equal(true);
    });

    it("취소 후 다시 등록할 수 있다 (새 거래 ID)", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Free, 0);
      const first = await list(ctx, ctx.artist, tokenId, PRICE);
      await ctx.escrow.connect(ctx.artist).cancelListing(first);
      const second = await list(ctx, ctx.artist, tokenId, PRICE);
      expect(second).to.equal(first + 1n);
      expect((await getListing(ctx, second)).isPrimary).to.equal(true);
    });

    it("판매자가 아니면 취소할 수 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const listingId = await list(ctx, ctx.artist, await mint(ctx, Free, 0), PRICE);
      await expect(ctx.escrow.connect(ctx.other).cancelListing(listingId)).to.be.revertedWithCustomError(
        ctx.escrow,
        "NotSeller",
      );
    });

    it("구매된 뒤(LOCKED)에는 취소할 수 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId } = await lockedResale(ctx);
      await expect(ctx.escrow.connect(ctx.reseller).cancelListing(listingId))
        .to.be.revertedWithCustomError(ctx.escrow, "InvalidStatus")
        .withArgs(listingId, LOCKED);
    });
  });

  describe("구매 (LISTED → LOCKED)", () => {
    it("판매 가격과 같은 ETH를 예치하면 LOCKED가 되고 구매자·시각이 기록된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Free, 0);
      const listingId = await list(ctx, ctx.artist, tokenId, PRICE);

      const tx = ctx.escrow.connect(ctx.buyer).buy(listingId, { value: PRICE });
      await expect(tx).to.emit(ctx.escrow, "Purchased").withArgs(listingId, tokenId, ctx.buyer.address);
      await expect(tx).to.changeEtherBalances(ethers, [ctx.buyer, ctx.escrow], [-PRICE, PRICE]);

      const l = await getListing(ctx, listingId);
      expect(l.status).to.equal(LOCKED);
      expect(l.buyer).to.equal(ctx.buyer.address);
      expect(l.lockedAt).to.equal(BigInt(await time.latest()));
    });

    it("금액이 다르면(부족·초과) 거부된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const listingId = await list(ctx, ctx.artist, await mint(ctx, Free, 0), PRICE);
      for (const value of [PRICE - 1n, PRICE + 1n, 0n]) {
        await expect(ctx.escrow.connect(ctx.buyer).buy(listingId, { value }))
          .to.be.revertedWithCustomError(ctx.escrow, "IncorrectPayment")
          .withArgs(PRICE, value);
      }
    });

    it("판매자 본인은 구매할 수 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const listingId = await list(ctx, ctx.artist, await mint(ctx, Free, 0), PRICE);
      await expect(ctx.escrow.connect(ctx.artist).buy(listingId, { value: PRICE })).to.be.revertedWithCustomError(
        ctx.escrow,
        "SelfPurchase",
      );
    });

    it("이미 구매된 거래는 다른 사람이 다시 구매할 수 없다 (중복 구매 차단)", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId } = await lockedResale(ctx);
      await expect(ctx.escrow.connect(ctx.otherBuyer).buy(listingId, { value: PRICE }))
        .to.be.revertedWithCustomError(ctx.escrow, "InvalidStatus")
        .withArgs(listingId, LOCKED);
    });

    it("취소된 거래나 존재하지 않는 거래는 구매할 수 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const listingId = await list(ctx, ctx.artist, await mint(ctx, Free, 0), PRICE);
      await ctx.escrow.connect(ctx.artist).cancelListing(listingId);
      await expect(ctx.escrow.connect(ctx.buyer).buy(listingId, { value: PRICE })).to.be.revertedWithCustomError(
        ctx.escrow,
        "InvalidStatus",
      );
      for (const id of [0n, 99n]) {
        await expect(ctx.escrow.connect(ctx.buyer).buy(id, { value: PRICE }))
          .to.be.revertedWithCustomError(ctx.escrow, "ListingNotFound")
          .withArgs(id);
      }
    });
  });

  describe("수령 승인과 정산 (LOCKED → COMPLETED)", () => {
    it("최초 판매: 아티스트가 전액을 받고 로열티는 0, NFT는 구매자에게 이전되며 최초 판매 자격이 종료된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Royalty, 1_000);
      const listingId = await list(ctx, ctx.artist, tokenId, PRICE);
      await ctx.escrow.connect(ctx.buyer).buy(listingId, { value: PRICE });

      await expect(ctx.escrow.connect(ctx.buyer).confirmReceipt(listingId))
        .to.emit(ctx.escrow, "Completed")
        .withArgs(listingId, tokenId, ctx.artist.address, ctx.buyer.address, PRICE, 0n, CID);

      expect(await ctx.escrow.pendingWithdrawals(ctx.artist.address)).to.equal(PRICE);
      expect(await ctx.nft.ownerOf(tokenId)).to.equal(ctx.buyer.address);
      expect(await ctx.nft.isPrimaryAvailable(tokenId)).to.equal(false);
      const l = await getListing(ctx, listingId);
      expect(l.status).to.equal(COMPLETED);
      expect(l.closedAt).to.be.greaterThan(0n);
    });

    it("창작자 상생형 재판매: 판매자와 아티스트에게 비율대로 적립된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { tokenId, listingId } = await lockedResale(ctx, Royalty, 500, PRICE); // 5%
      const artistBefore = await ctx.escrow.pendingWithdrawals(ctx.artist.address);
      const royalty = (PRICE * 500n) / 10_000n;

      await expect(ctx.escrow.connect(ctx.buyer).confirmReceipt(listingId))
        .to.emit(ctx.escrow, "Completed")
        .withArgs(listingId, tokenId, ctx.reseller.address, ctx.buyer.address, PRICE, royalty, CID);

      expect(await ctx.escrow.pendingWithdrawals(ctx.reseller.address)).to.equal(PRICE - royalty);
      expect((await ctx.escrow.pendingWithdrawals(ctx.artist.address)) - artistBefore).to.equal(royalty);
    });

    it("로열티는 소수점 이하를 버리고, 판매자 몫과 합치면 판매가와 정확히 같다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const price = 10_001n; // 10001 × 2.5% = 250.025 wei
      const { listingId } = await lockedResale(ctx, Royalty, 250, price);
      const artistBefore = await ctx.escrow.pendingWithdrawals(ctx.artist.address);

      await ctx.escrow.connect(ctx.buyer).confirmReceipt(listingId);

      const sellerAmount = await ctx.escrow.pendingWithdrawals(ctx.reseller.address);
      const royalty = (await ctx.escrow.pendingWithdrawals(ctx.artist.address)) - artistBefore;
      expect(royalty).to.equal(250n);
      expect(sellerAmount).to.equal(9_751n);
      expect(sellerAmount + royalty).to.equal(price);
    });

    it("정가 보호형·자유 거래형 재판매는 로열티가 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      for (const [policy, bps] of [
        [PriceCap, 15_000],
        [Free, 0],
      ]) {
        const tokenId = await resaleReady(ctx, policy, bps);
        const artistBefore = await ctx.escrow.pendingWithdrawals(ctx.artist.address);
        const sellerBefore = await ctx.escrow.pendingWithdrawals(ctx.reseller.address);
        const listingId = await list(ctx, ctx.reseller, tokenId, PRICE);
        await ctx.escrow.connect(ctx.buyer).buy(listingId, { value: PRICE });
        await ctx.escrow.connect(ctx.buyer).confirmReceipt(listingId);

        expect(await ctx.escrow.pendingWithdrawals(ctx.artist.address)).to.equal(artistBefore);
        expect((await ctx.escrow.pendingWithdrawals(ctx.reseller.address)) - sellerBefore).to.equal(PRICE);
      }
    });

    it("아티스트 본인의 재판매(창작자 상생형)는 로열티 0으로 기록되고 전액을 받는다 (D10)", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await resaleReady(ctx, Royalty, 1_000);
      await ctx.nft.connect(ctx.reseller).transferFrom(ctx.reseller.address, ctx.artist.address, tokenId);
      const artistBefore = await ctx.escrow.pendingWithdrawals(ctx.artist.address);

      const price = PRICE * 3n;
      const listingId = await list(ctx, ctx.artist, tokenId, price);
      await ctx.escrow.connect(ctx.buyer).buy(listingId, { value: price });
      await expect(ctx.escrow.connect(ctx.buyer).confirmReceipt(listingId))
        .to.emit(ctx.escrow, "Completed")
        .withArgs(listingId, tokenId, ctx.artist.address, ctx.buyer.address, price, 0n, CID);
      expect((await ctx.escrow.pendingWithdrawals(ctx.artist.address)) - artistBefore).to.equal(price);
    });

    it("구매자가 아니면 수령 승인할 수 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId } = await lockedResale(ctx);
      for (const signer of [ctx.reseller, ctx.other]) {
        await expect(ctx.escrow.connect(signer).confirmReceipt(listingId)).to.be.revertedWithCustomError(
          ctx.escrow,
          "NotBuyer",
        );
      }
    });

    it("같은 거래를 두 번 정산할 수 없다 (승인 → 승인, 승인 → 기한 청구)", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId, deadline } = await lockedResale(ctx);
      await ctx.escrow.connect(ctx.buyer).confirmReceipt(listingId);
      const pendingAfter = await ctx.escrow.pendingWithdrawals(ctx.reseller.address);

      await expect(ctx.escrow.connect(ctx.buyer).confirmReceipt(listingId))
        .to.be.revertedWithCustomError(ctx.escrow, "InvalidStatus")
        .withArgs(listingId, COMPLETED);
      await time.increaseTo(deadline);
      await expect(ctx.escrow.connect(ctx.reseller).claimAfterTimeout(listingId))
        .to.be.revertedWithCustomError(ctx.escrow, "InvalidStatus")
        .withArgs(listingId, COMPLETED);
      expect(await ctx.escrow.pendingWithdrawals(ctx.reseller.address)).to.equal(pendingAfter);
    });

    it("기한이 지난 뒤에도 판매자가 청구하기 전이면 구매자가 승인할 수 있다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId, deadline } = await lockedResale(ctx);
      await time.increaseTo(deadline + 100n);
      await ctx.escrow.connect(ctx.buyer).confirmReceipt(listingId);
      expect((await getListing(ctx, listingId)).status).to.equal(COMPLETED);
    });
  });

  describe("기한 경계 (deadline = lockedAt + confirmPeriod)", () => {
    it("분쟁 제기: deadline − 1초는 허용", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId, deadline } = await lockedResale(ctx);
      await time.setNextBlockTimestamp(deadline - 1n);
      await ctx.escrow.connect(ctx.buyer).openDispute(listingId);
      expect((await getListing(ctx, listingId)).status).to.equal(DISPUTED);
    });

    it("분쟁 제기: deadline 정각은 거부", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId, deadline } = await lockedResale(ctx);
      await time.setNextBlockTimestamp(deadline);
      await expect(ctx.escrow.connect(ctx.buyer).openDispute(listingId)).to.be.revertedWithCustomError(
        ctx.escrow,
        "DeadlinePassed",
      );
    });

    it("자동 정산 청구: deadline − 1초는 거부", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId, deadline } = await lockedResale(ctx);
      await time.setNextBlockTimestamp(deadline - 1n);
      await expect(ctx.escrow.connect(ctx.reseller).claimAfterTimeout(listingId)).to.be.revertedWithCustomError(
        ctx.escrow,
        "DeadlineNotReached",
      );
    });

    it("자동 정산 청구: deadline 정각은 허용되고 정산된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { tokenId, listingId, deadline } = await lockedResale(ctx, Royalty, 500);
      await time.setNextBlockTimestamp(deadline);
      await expect(ctx.escrow.connect(ctx.reseller).claimAfterTimeout(listingId)).to.emit(ctx.escrow, "Completed");
      expect(await ctx.nft.ownerOf(tokenId)).to.equal(ctx.buyer.address);
      expect(await ctx.escrow.pendingWithdrawals(ctx.reseller.address)).to.equal(PRICE - PRICE / 20n);
    });

    it("자동 정산 청구는 판매자만 할 수 있다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId, deadline } = await lockedResale(ctx);
      await time.increaseTo(deadline + 1n);
      for (const signer of [ctx.buyer, ctx.other]) {
        await expect(ctx.escrow.connect(signer).claimAfterTimeout(listingId)).to.be.revertedWithCustomError(
          ctx.escrow,
          "NotSeller",
        );
      }
    });

    it("분쟁 중(DISPUTED)에는 기한이 지나도 자동 정산을 청구할 수 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId, deadline } = await lockedResale(ctx);
      await ctx.escrow.connect(ctx.buyer).openDispute(listingId);
      await time.increaseTo(deadline + 1000n);
      await expect(ctx.escrow.connect(ctx.reseller).claimAfterTimeout(listingId))
        .to.be.revertedWithCustomError(ctx.escrow, "InvalidStatus")
        .withArgs(listingId, DISPUTED);
    });
  });

  describe("판매자 환불 (LOCKED → CANCELLED, D4)", () => {
    it("판매자가 환불하면 구매자에게 전액 적립되고 NFT는 판매자에게 돌아온다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { tokenId, listingId } = await lockedResale(ctx);

      await expect(ctx.escrow.connect(ctx.reseller).refundBySeller(listingId))
        .to.emit(ctx.escrow, "Cancelled")
        .withArgs(listingId, tokenId, SellerRefunded);

      expect(await ctx.escrow.pendingWithdrawals(ctx.buyer.address)).to.equal(PRICE);
      expect(await ctx.nft.ownerOf(tokenId)).to.equal(ctx.reseller.address);
      expect((await getListing(ctx, listingId)).status).to.equal(CANCELLED);
    });

    it("기한이 지난 뒤에도 판매자는 환불할 수 있다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId, deadline } = await lockedResale(ctx);
      await time.increaseTo(deadline + 1n);
      await expect(ctx.escrow.connect(ctx.reseller).refundBySeller(listingId)).to.not.be.revert(ethers);
    });

    it("판매자가 아니면 환불할 수 없고, 분쟁 중에는 판매자도 환불할 수 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId } = await lockedResale(ctx);
      await expect(ctx.escrow.connect(ctx.buyer).refundBySeller(listingId)).to.be.revertedWithCustomError(
        ctx.escrow,
        "NotSeller",
      );
      await ctx.escrow.connect(ctx.buyer).openDispute(listingId);
      await expect(ctx.escrow.connect(ctx.reseller).refundBySeller(listingId))
        .to.be.revertedWithCustomError(ctx.escrow, "InvalidStatus")
        .withArgs(listingId, DISPUTED);
    });
  });

  describe("분쟁 (LOCKED → DISPUTED → CANCELLED | COMPLETED, D5)", () => {
    it("구매자만 분쟁을 제기할 수 있다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { tokenId, listingId } = await lockedResale(ctx);
      for (const signer of [ctx.reseller, ctx.other, ctx.admin]) {
        await expect(ctx.escrow.connect(signer).openDispute(listingId)).to.be.revertedWithCustomError(
          ctx.escrow,
          "NotBuyer",
        );
      }
      await expect(ctx.escrow.connect(ctx.buyer).openDispute(listingId))
        .to.emit(ctx.escrow, "Disputed")
        .withArgs(listingId, tokenId, ctx.buyer.address);
    });

    it("분쟁 중에는 구매자의 수령 승인도 할 수 없다 (중재 결과로만 종료)", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId } = await lockedResale(ctx);
      await ctx.escrow.connect(ctx.buyer).openDispute(listingId);
      await expect(ctx.escrow.connect(ctx.buyer).confirmReceipt(listingId))
        .to.be.revertedWithCustomError(ctx.escrow, "InvalidStatus")
        .withArgs(listingId, DISPUTED);
    });

    it("중재 결과 '구매자 환불': 구매자에게 전액 적립, NFT는 판매자에게 반환", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { tokenId, listingId } = await lockedResale(ctx);
      await ctx.escrow.connect(ctx.buyer).openDispute(listingId);

      await expect(ctx.escrow.connect(ctx.admin).resolveDispute(listingId, true))
        .to.emit(ctx.escrow, "DisputeResolved")
        .withArgs(listingId, true)
        .and.to.emit(ctx.escrow, "Cancelled")
        .withArgs(listingId, tokenId, DisputeRefunded);

      expect(await ctx.escrow.pendingWithdrawals(ctx.buyer.address)).to.equal(PRICE);
      expect(await ctx.nft.ownerOf(tokenId)).to.equal(ctx.reseller.address);
      expect((await getListing(ctx, listingId)).status).to.equal(CANCELLED);
    });

    it("중재 결과 '판매자 정산': 로열티를 포함해 정산되고 NFT는 구매자에게 이전", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { tokenId, listingId } = await lockedResale(ctx, Royalty, 1_000);
      await ctx.escrow.connect(ctx.buyer).openDispute(listingId);
      const royalty = PRICE / 10n;

      await expect(ctx.escrow.connect(ctx.admin).resolveDispute(listingId, false))
        .to.emit(ctx.escrow, "Completed")
        .withArgs(listingId, tokenId, ctx.reseller.address, ctx.buyer.address, PRICE, royalty, CID);

      expect(await ctx.escrow.pendingWithdrawals(ctx.reseller.address)).to.equal(PRICE - royalty);
      expect(await ctx.nft.ownerOf(tokenId)).to.equal(ctx.buyer.address);
    });

    it("중재자 권한이 없으면 분쟁을 처리할 수 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId } = await lockedResale(ctx);
      await ctx.escrow.connect(ctx.buyer).openDispute(listingId);
      for (const signer of [ctx.buyer, ctx.reseller, ctx.other]) {
        await expect(ctx.escrow.connect(signer).resolveDispute(listingId, true)).to.be.revertedWithCustomError(
          ctx.escrow,
          "AccessControlUnauthorizedAccount",
        );
      }
    });

    it("분쟁 상태가 아니면 중재할 수 없고, 같은 분쟁을 두 번 처리할 수 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId } = await lockedResale(ctx);
      await expect(ctx.escrow.connect(ctx.admin).resolveDispute(listingId, false))
        .to.be.revertedWithCustomError(ctx.escrow, "InvalidStatus")
        .withArgs(listingId, LOCKED);

      await ctx.escrow.connect(ctx.buyer).openDispute(listingId);
      await ctx.escrow.connect(ctx.admin).resolveDispute(listingId, true);
      await expect(ctx.escrow.connect(ctx.admin).resolveDispute(listingId, false))
        .to.be.revertedWithCustomError(ctx.escrow, "InvalidStatus")
        .withArgs(listingId, CANCELLED);
    });

    it("중재자는 정해진 두 결과 외의 자금 이동 수단이 없다 (관리자 출금 함수 없음)", async () => {
      const { escrow } = await networkHelpers.loadFixture(deployFixture);
      const writeFunctions = escrow.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => f as unknown as { name: string; stateMutability: string })
        .filter((f) => f.stateMutability !== "view" && f.stateMutability !== "pure")
        .map((f) => f.name);
      expect([...new Set(writeFunctions)].sort()).to.deep.equal(
        [
          "buy",
          "cancelListing",
          "claimAfterTimeout",
          "confirmReceipt",
          "grantRole",
          "list",
          "openDispute",
          "refundBySeller",
          "renounceRole",
          "resolveDispute",
          "revokeRole",
          "withdraw",
        ].sort(),
      );
    });
  });

  describe("출금 (pull payment)", () => {
    it("적립된 금액을 출금하면 대기액이 0이 되고, 다시 출금하면 거부된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId } = await lockedResale(ctx, Free, 0);
      await ctx.escrow.connect(ctx.buyer).confirmReceipt(listingId);
      const amount = await ctx.escrow.pendingWithdrawals(ctx.reseller.address);

      const tx = ctx.escrow.connect(ctx.reseller).withdraw();
      await expect(tx).to.emit(ctx.escrow, "Withdrawn").withArgs(ctx.reseller.address, amount);
      await expect(tx).to.changeEtherBalances(ethers, [ctx.reseller, ctx.escrow], [amount, -amount]);

      expect(await ctx.escrow.pendingWithdrawals(ctx.reseller.address)).to.equal(0n);
      await expect(ctx.escrow.connect(ctx.reseller).withdraw()).to.be.revertedWithCustomError(
        ctx.escrow,
        "NothingToWithdraw",
      );
    });

    it("적립액이 없는 사용자는 출금할 수 없다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      await expect(ctx.escrow.connect(ctx.other).withdraw()).to.be.revertedWithCustomError(
        ctx.escrow,
        "NothingToWithdraw",
      );
    });

    it("재진입 공격: 출금 중 다시 withdraw를 호출해도 차단되고 한 번만 지급된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const attacker = await ethers.deployContract("MockBuyer", [ctx.escrowAddress]);
      const attackerAddress = await attacker.getAddress();

      // 공격 컨트랙트가 구매 → 판매자 환불로 대기액 PRICE를 얻고, 다른 사용자의 대기액도 쌓아 둔다
      const tokenId = await resaleReady(ctx, Free, 0); // artist 대기액 PRICE 생성
      const listingId = await list(ctx, ctx.reseller, tokenId, PRICE);
      await attacker.buy(listingId, { value: PRICE });
      await ctx.escrow.connect(ctx.reseller).refundBySeller(listingId);
      expect(await ctx.escrow.pendingWithdrawals(attackerAddress)).to.equal(PRICE);
      const escrowBalanceBefore = await ethers.provider.getBalance(ctx.escrowAddress);

      await attacker.setMode(2); // Reenter
      await attacker.withdraw();

      expect(await attacker.reentryAttempted()).to.equal(true);
      expect(await attacker.reentryBlocked()).to.equal(true);
      expect(await attacker.receivedTotal()).to.equal(PRICE);
      expect(await ctx.escrow.pendingWithdrawals(attackerAddress)).to.equal(0n);
      expect(await ethers.provider.getBalance(ctx.escrowAddress)).to.equal(escrowBalanceBefore - PRICE);
      // 다른 사용자의 대기액은 그대로
      expect(await ctx.escrow.pendingWithdrawals(ctx.artist.address)).to.equal(PRICE);
    });

    it("ETH 수신을 거부하는 주소는 출금이 실패하지만 대기액은 남고, 다른 사용자에게 영향이 없으며 나중에 재시도할 수 있다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const rejecter = await ethers.deployContract("MockBuyer", [ctx.escrowAddress]);
      const rejecterAddress = await rejecter.getAddress();

      const tokenId = await resaleReady(ctx, Free, 0);
      const listingId = await list(ctx, ctx.reseller, tokenId, PRICE);
      await rejecter.buy(listingId, { value: PRICE });
      await ctx.escrow.connect(ctx.reseller).refundBySeller(listingId);

      await rejecter.setMode(1); // Reject
      await expect(rejecter.withdraw()).to.be.revertedWithCustomError(ctx.escrow, "WithdrawFailed");
      expect(await ctx.escrow.pendingWithdrawals(rejecterAddress)).to.equal(PRICE);

      // 다른 사용자(아티스트)는 정상 출금
      await expect(ctx.escrow.connect(ctx.artist).withdraw()).to.not.be.revert(ethers);

      // 수신 가능 상태로 바꾸면 재시도 성공
      await rejecter.setMode(0); // Accept
      await rejecter.withdraw();
      expect(await rejecter.receivedTotal()).to.equal(PRICE);
      expect(await ctx.escrow.pendingWithdrawals(rejecterAddress)).to.equal(0n);
    });
  });

  describe("NFT 전송 (transferFrom 사용)", () => {
    it("NFT 수신 기능이 없는 컨트랙트 구매자도 수령 승인으로 거래가 완료된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const mockBuyer = await ethers.deployContract("MockBuyer", [ctx.escrowAddress]);
      const tokenId = await resaleReady(ctx, Free, 0);
      const listingId = await list(ctx, ctx.reseller, tokenId, PRICE);
      await mockBuyer.buy(listingId, { value: PRICE });
      await mockBuyer.confirmReceipt(listingId);
      expect(await ctx.nft.ownerOf(tokenId)).to.equal(await mockBuyer.getAddress());
    });

    it("NFT 수신 기능이 없는 컨트랙트 구매자가 승인하지 않아도 판매자는 기한 후 정산받는다 (DoS 없음)", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const mockBuyer = await ethers.deployContract("MockBuyer", [ctx.escrowAddress]);
      const tokenId = await resaleReady(ctx, Free, 0);
      const listingId = await list(ctx, ctx.reseller, tokenId, PRICE);
      await mockBuyer.buy(listingId, { value: PRICE });

      await time.increaseTo((await getListing(ctx, listingId)).lockedAt + CONFIRM_PERIOD);
      await ctx.escrow.connect(ctx.reseller).claimAfterTimeout(listingId);
      expect(await ctx.nft.ownerOf(tokenId)).to.equal(await mockBuyer.getAddress());
      expect(await ctx.escrow.pendingWithdrawals(ctx.reseller.address)).to.equal(PRICE);
    });
  });

  describe("최초 판매 자격 통합 (BSideNFT + BSideEscrow, D9)", () => {
    it("예치·취소·판매자 환불·분쟁 환불을 거쳐도 자격이 유지되고, 완료되면 종료된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Royalty, 500);
      const available = () => ctx.nft.isPrimaryAvailable(tokenId);

      // 1) 예치 → 취소
      let id = await list(ctx, ctx.artist, tokenId, PRICE);
      expect(await available()).to.equal(true);
      await ctx.escrow.connect(ctx.artist).cancelListing(id);
      expect(await available()).to.equal(true);

      // 2) 예치 → 구매 → 판매자 환불
      id = await list(ctx, ctx.artist, tokenId, PRICE);
      await ctx.escrow.connect(ctx.buyer).buy(id, { value: PRICE });
      await ctx.escrow.connect(ctx.artist).refundBySeller(id);
      expect(await available()).to.equal(true);

      // 3) 예치 → 구매 → 분쟁 → 중재 환불
      id = await list(ctx, ctx.artist, tokenId, PRICE);
      await ctx.escrow.connect(ctx.buyer).buy(id, { value: PRICE });
      await ctx.escrow.connect(ctx.buyer).openDispute(id);
      await ctx.escrow.connect(ctx.admin).resolveDispute(id, true);
      expect(await available()).to.equal(true);
      expect((await getListing(ctx, id)).isPrimary).to.equal(true);

      // 4) 예치 → 구매 → 수령 승인 → 자격 종료
      id = await list(ctx, ctx.artist, tokenId, PRICE);
      await ctx.escrow.connect(ctx.buyer).buy(id, { value: PRICE });
      await ctx.escrow.connect(ctx.buyer).confirmReceipt(id);
      expect(await available()).to.equal(false);

      // 5) 구매자가 다시 판매 → 재판매로 등록
      const resaleId = await list(ctx, ctx.buyer, tokenId, PRICE * 2n);
      expect((await getListing(ctx, resaleId)).isPrimary).to.equal(false);
    });

    it("분쟁 중재 결과 '판매자 정산'으로 최초 판매가 완료되어도 자격이 종료된다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const tokenId = await mint(ctx, Free, 0);
      const id = await list(ctx, ctx.artist, tokenId, PRICE);
      await ctx.escrow.connect(ctx.buyer).buy(id, { value: PRICE });
      await ctx.escrow.connect(ctx.buyer).openDispute(id);
      await ctx.escrow.connect(ctx.admin).resolveDispute(id, false);
      expect(await ctx.nft.isPrimaryAvailable(tokenId)).to.equal(false);
    });
  });

  describe("자금 보존 불변식", () => {
    it("여러 거래가 섞인 시나리오의 각 단계에서 잔액 = 대기액 합 + 보관 중 대금 합", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const accounts = [ctx.artist, ctx.reseller, ctx.buyer, ctx.otherBuyer, ctx.other].map((s) => s.address);
      const check = async () => {
        const { balance, required } = await solvency(ctx, accounts);
        expect(balance).to.equal(required);
      };

      const t1 = await mint(ctx, Royalty, 700);
      const t2 = await mint(ctx, PriceCap, 13_000);
      const t3 = await mint(ctx, Free, 0);
      await check();

      const l1 = await list(ctx, ctx.artist, t1, PRICE);
      const l2 = await list(ctx, ctx.artist, t2, PRICE);
      const l3 = await list(ctx, ctx.artist, t3, PRICE);
      await check();

      await ctx.escrow.connect(ctx.buyer).buy(l1, { value: PRICE });
      await ctx.escrow.connect(ctx.otherBuyer).buy(l2, { value: PRICE });
      await ctx.escrow.connect(ctx.reseller).buy(l3, { value: PRICE });
      await check();

      await ctx.escrow.connect(ctx.buyer).confirmReceipt(l1); // 완료
      await ctx.escrow.connect(ctx.otherBuyer).openDispute(l2); // 분쟁
      await ctx.escrow.connect(ctx.artist).refundBySeller(l3); // 환불
      await check();

      await ctx.escrow.connect(ctx.admin).resolveDispute(l2, false);
      const r1 = await list(ctx, ctx.buyer, t1, PRICE * 5n); // 창작자 상생형 재판매
      await ctx.escrow.connect(ctx.other).buy(r1, { value: PRICE * 5n });
      await check();

      await time.increaseTo((await getListing(ctx, r1)).lockedAt + CONFIRM_PERIOD);
      await ctx.escrow.connect(ctx.buyer).claimAfterTimeout(r1);
      await check();

      for (const s of [ctx.artist, ctx.reseller, ctx.buyer]) {
        if ((await ctx.escrow.pendingWithdrawals(s.address)) > 0n) await ctx.escrow.connect(s).withdraw();
        await check();
      }
    });

    it("강제로 ETH가 들어와 잔액이 늘어도 불변식(≥)이 유지되고 정상 동작한다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      const { listingId } = await lockedResale(ctx, Free, 0);
      const current = await ethers.provider.getBalance(ctx.escrowAddress);
      await networkHelpers.setBalance(ctx.escrowAddress, current + 12_345n); // selfdestruct 등 강제 송금 재현

      const accounts = [ctx.artist, ctx.reseller, ctx.buyer].map((s) => s.address);
      let { balance, required } = await solvency(ctx, accounts);
      expect(balance >= required).to.equal(true);

      await ctx.escrow.connect(ctx.buyer).confirmReceipt(listingId);
      await ctx.escrow.connect(ctx.reseller).withdraw();
      ({ balance, required } = await solvency(ctx, accounts));
      expect(balance >= required).to.equal(true);
    });
  });

  describe("조회", () => {
    it("getListings는 offset·limit 범위로 거래 정보를 돌려주고, 거래 ID는 1부터 시작한다", async () => {
      const ctx = await networkHelpers.loadFixture(deployFixture);
      for (let i = 0; i < 4; i++) await list(ctx, ctx.artist, await mint(ctx, Free, 0), PRICE);
      expect(await ctx.escrow.listingCount()).to.equal(4n);

      const page = await ctx.escrow.getListings(1n, 2n);
      expect(page.map((v) => v.listingId)).to.deep.equal([2n, 3n]);
      expect(page[0].listing.tokenId).to.equal(2n);
      expect(page[0].listing.seller).to.equal(ctx.artist.address);

      expect(await ctx.escrow.getListings(2n, 100n)).to.have.length(2);
      expect(await ctx.escrow.getListings(4n, 1n)).to.have.length(0);
      expect(await ctx.escrow.getListings(0n, 0n)).to.have.length(0);
    });
  });
});

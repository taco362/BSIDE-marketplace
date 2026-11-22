import { expect } from "chai";
import { network } from "hardhat";
import type { BSideNFT } from "../types/ethers-contracts/index.js";

const { ethers, networkHelpers } = await network.getOrCreate();

// 정책 enum 값 (BSideNFT.Policy)
const PriceCap = 0;
const Royalty = 1;
const Free = 2;

const URI = "ipfs://bafytestcid"; // 단위 테스트용 임의 CID (IPFS 조회 안 함)
const PRICE = ethers.parseEther("0.01");

type Signer = Awaited<ReturnType<typeof ethers.getSigners>>[number];

/**
 * 실제 에스크로의 list()와 같은 방식으로 예치한다:
 * 소유자가 approve한 뒤, 에스크로(테스트에서는 일반 계정)가 직접 transferFrom을 호출한다.
 */
async function deposit(nft: BSideNFT, owner: Signer, escrowAccount: Signer, tokenId: bigint) {
  await nft.connect(owner).approve(escrowAccount.address, tokenId);
  await nft.connect(escrowAccount).transferFrom(owner.address, escrowAccount.address, tokenId);
}

describe("BSideNFT", () => {
  async function deployFixture() {
    const [admin, artist, otherArtist, user, buyer, escrowAccount] = await ethers.getSigners();
    const nft = await ethers.deployContract("BSideNFT", [admin.address]);
    const ARTIST_ROLE = await nft.ARTIST_ROLE();
    await nft.connect(admin).grantRole(ARTIST_ROLE, artist.address);
    await nft.connect(admin).grantRole(ARTIST_ROLE, otherArtist.address);
    return { nft, ARTIST_ROLE, admin, artist, otherArtist, user, buyer, escrowAccount };
  }

  /** 아티스트가 기본값(정가 보호형 120%)으로 1개 발행한 상태 */
  async function mintedFixture() {
    const ctx = await deployFixture();
    await ctx.nft.connect(ctx.artist).mint(URI, PRICE, PriceCap, 12_000);
    return { ...ctx, tokenId: 1n };
  }

  /** 에스크로 주소(테스트에서는 일반 계정으로 대체)를 등록한 상태 */
  async function escrowSetFixture() {
    const ctx = await mintedFixture();
    await ctx.nft.connect(ctx.admin).setEscrow(ctx.escrowAccount.address);
    return ctx;
  }

  describe("배포와 권한", () => {
    it("배포 시 지정한 주소가 관리자가 된다", async () => {
      const { nft, admin } = await networkHelpers.loadFixture(deployFixture);
      expect(await nft.hasRole(await nft.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    });

    it("관리자 주소가 0이면 배포가 거부된다", async () => {
      const factory = await ethers.getContractFactory("BSideNFT");
      await expect(factory.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });

    it("승인되지 않은 사용자는 발행할 수 없다", async () => {
      const { nft, user, ARTIST_ROLE } = await networkHelpers.loadFixture(deployFixture);
      await expect(nft.connect(user).mint(URI, PRICE, Free, 0))
        .to.be.revertedWithCustomError(nft, "AccessControlUnauthorizedAccount")
        .withArgs(user.address, ARTIST_ROLE);
    });

    it("관리자도 아티스트 권한이 없으면 발행할 수 없다", async () => {
      const { nft, admin } = await networkHelpers.loadFixture(deployFixture);
      await expect(nft.connect(admin).mint(URI, PRICE, Free, 0)).to.be.revertedWithCustomError(
        nft,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("관리자가 아닌 사용자는 아티스트를 등록할 수 없다", async () => {
      const { nft, artist, user, ARTIST_ROLE } = await networkHelpers.loadFixture(deployFixture);
      await expect(nft.connect(artist).grantRole(ARTIST_ROLE, user.address)).to.be.revertedWithCustomError(
        nft,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("권한이 회수된 아티스트는 발행할 수 없지만, 이미 발행한 NFT의 정보는 유지된다", async () => {
      const { nft, admin, artist, ARTIST_ROLE, tokenId } = await networkHelpers.loadFixture(mintedFixture);
      await nft.connect(admin).revokeRole(ARTIST_ROLE, artist.address);

      await expect(nft.connect(artist).mint(URI, PRICE, Free, 0)).to.be.revertedWithCustomError(
        nft,
        "AccessControlUnauthorizedAccount",
      );
      const info = await nft.getTokenInfo(tokenId);
      expect(info.artist).to.equal(artist.address);
      expect(await nft.ownerOf(tokenId)).to.equal(artist.address);
    });
  });

  describe("발행", () => {
    it("토큰 ID는 1부터 순서대로 붙고, 발행자에게 지급되며 정보가 기록된다", async () => {
      const { nft, artist, otherArtist } = await networkHelpers.loadFixture(deployFixture);

      await expect(nft.connect(artist).mint(URI, PRICE, Royalty, 500))
        .to.emit(nft, "Transfer")
        .withArgs(ethers.ZeroAddress, artist.address, 1n);
      await nft.connect(otherArtist).mint("ipfs://second", PRICE * 2n, Free, 0);

      expect(await nft.totalMinted()).to.equal(2n);
      expect(await nft.ownerOf(1n)).to.equal(artist.address);
      expect(await nft.ownerOf(2n)).to.equal(otherArtist.address);
      expect(await nft.tokenURI(1n)).to.equal(URI);

      const info = await nft.getTokenInfo(1n);
      expect(info.artist).to.equal(artist.address);
      expect(info.initialPrice).to.equal(PRICE);
      expect(info.policy).to.equal(BigInt(Royalty));
      expect(info.policyBps).to.equal(500n);
    });

    it("메타데이터 URI가 비어 있으면 거부된다", async () => {
      const { nft, artist } = await networkHelpers.loadFixture(deployFixture);
      await expect(nft.connect(artist).mint("", PRICE, Free, 0)).to.be.revertedWithCustomError(nft, "EmptyTokenURI");
    });

    it("최초 판매가가 0이면 거부된다", async () => {
      const { nft, artist } = await networkHelpers.loadFixture(deployFixture);
      await expect(nft.connect(artist).mint(URI, 0n, Free, 0)).to.be.revertedWithCustomError(nft, "ZeroInitialPrice");
    });
  });

  describe("정책 수치 범위 (D3)", () => {
    const cases: Array<{ name: string; policy: number; bps: number; ok: boolean }> = [
      { name: "정가 보호형 99.99% (하한 미만)", policy: PriceCap, bps: 9_999, ok: false },
      { name: "정가 보호형 100% (하한)", policy: PriceCap, bps: 10_000, ok: true },
      { name: "정가 보호형 150% (상한)", policy: PriceCap, bps: 15_000, ok: true },
      { name: "정가 보호형 150.01% (상한 초과)", policy: PriceCap, bps: 15_001, ok: false },
      { name: "창작자 상생형 0.99% (하한 미만)", policy: Royalty, bps: 99, ok: false },
      { name: "창작자 상생형 1% (하한)", policy: Royalty, bps: 100, ok: true },
      { name: "창작자 상생형 10% (상한)", policy: Royalty, bps: 1_000, ok: true },
      { name: "창작자 상생형 10.01% (상한 초과)", policy: Royalty, bps: 1_001, ok: false },
      { name: "자유 거래형 0", policy: Free, bps: 0, ok: true },
      { name: "자유 거래형 0이 아닌 값", policy: Free, bps: 1, ok: false },
    ];

    for (const c of cases) {
      it(`${c.name} → ${c.ok ? "허용" : "거부"}`, async () => {
        const { nft, artist } = await networkHelpers.loadFixture(deployFixture);
        const tx = nft.connect(artist).mint(URI, PRICE, c.policy, c.bps);
        if (c.ok) {
          await expect(tx).to.not.be.revert(ethers);
        } else {
          await expect(tx).to.be.revertedWithCustomError(nft, "InvalidPolicyBps").withArgs(c.policy, c.bps);
        }
      });
    }

    it("정의되지 않은 정책 값은 거부된다", async () => {
      const { nft, artist } = await networkHelpers.loadFixture(deployFixture);
      await expect(nft.connect(artist).mint(URI, PRICE, 3, 0)).to.be.revert(ethers);
    });
  });

  describe("정책 불변", () => {
    it("상태를 바꾸는 함수 중 토큰 정보를 수정하는 함수가 없다", async () => {
      const { nft } = await networkHelpers.loadFixture(deployFixture);
      const writeFunctions = nft.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => f as unknown as { name: string; stateMutability: string })
        .filter((f) => f.stateMutability !== "view" && f.stateMutability !== "pure")
        .map((f) => f.name);

      expect([...new Set(writeFunctions)].sort()).to.deep.equal(
        [
          "approve",
          "grantRole",
          "mint",
          "renounceRole",
          "revokeRole",
          "safeTransferFrom",
          "setApprovalForAll",
          "setEscrow",
          "transferFrom",
        ].sort(),
      );
    });

    it("NFT가 전송되어도 토큰 정보는 바뀌지 않는다", async () => {
      const { nft, artist, user, buyer, tokenId } = await networkHelpers.loadFixture(mintedFixture);
      const before = await nft.getTokenInfo(tokenId);

      await nft.connect(artist).transferFrom(artist.address, user.address, tokenId);
      await nft.connect(user).transferFrom(user.address, buyer.address, tokenId);

      const after = await nft.getTokenInfo(tokenId);
      expect(after.artist).to.equal(before.artist);
      expect(after.initialPrice).to.equal(before.initialPrice);
      expect(after.policy).to.equal(before.policy);
      expect(after.policyBps).to.equal(before.policyBps);
    });
  });

  describe("에스크로 주소 등록", () => {
    it("관리자가 등록하면 이벤트가 발생한다", async () => {
      const { nft, admin, escrowAccount } = await networkHelpers.loadFixture(deployFixture);
      await expect(nft.connect(admin).setEscrow(escrowAccount.address))
        .to.emit(nft, "EscrowSet")
        .withArgs(escrowAccount.address);
      expect(await nft.escrow()).to.equal(escrowAccount.address);
    });

    it("한 번만 등록할 수 있다", async () => {
      const { nft, admin, user } = await networkHelpers.loadFixture(escrowSetFixture);
      await expect(nft.connect(admin).setEscrow(user.address)).to.be.revertedWithCustomError(nft, "EscrowAlreadySet");
    });

    it("관리자가 아니면 등록할 수 없다", async () => {
      const { nft, user, escrowAccount } = await networkHelpers.loadFixture(deployFixture);
      await expect(nft.connect(user).setEscrow(escrowAccount.address)).to.be.revertedWithCustomError(
        nft,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("0 주소는 등록할 수 없다", async () => {
      const { nft, admin } = await networkHelpers.loadFixture(deployFixture);
      await expect(nft.connect(admin).setEscrow(ethers.ZeroAddress)).to.be.revertedWithCustomError(nft, "ZeroAddress");
    });
  });

  describe("에스크로 직접 전송 차단", () => {
    it("소유자가 transferFrom으로 에스크로에 직접 보내면 거부된다", async () => {
      const { nft, artist, escrowAccount, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await expect(
        nft.connect(artist).transferFrom(artist.address, escrowAccount.address, tokenId),
      ).to.be.revertedWithCustomError(nft, "DirectTransferToEscrow");
    });

    it("소유자가 safeTransferFrom으로 에스크로에 직접 보내도 거부된다", async () => {
      const { nft, artist, escrowAccount, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await expect(
        nft
          .connect(artist)
          ["safeTransferFrom(address,address,uint256)"](artist.address, escrowAccount.address, tokenId),
      ).to.be.revertedWithCustomError(nft, "DirectTransferToEscrow");
    });

    it("승인받은 대리인(operator)이 에스크로로 보내는 것도 거부된다", async () => {
      const { nft, artist, user, escrowAccount, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await nft.connect(artist).setApprovalForAll(user.address, true);
      await expect(
        nft.connect(user).transferFrom(artist.address, escrowAccount.address, tokenId),
      ).to.be.revertedWithCustomError(nft, "DirectTransferToEscrow");
    });

    it("에스크로가 승인을 받아 직접 가져가는 것(list 방식)은 허용된다", async () => {
      const { nft, artist, escrowAccount, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await deposit(nft, artist, escrowAccount, tokenId);
      expect(await nft.ownerOf(tokenId)).to.equal(escrowAccount.address);
    });

    it("에스크로가 등록되기 전에는 차단 규칙이 적용되지 않는다", async () => {
      const { nft, artist, escrowAccount, tokenId } = await networkHelpers.loadFixture(mintedFixture);
      await expect(nft.connect(artist).transferFrom(artist.address, escrowAccount.address, tokenId)).to.not.be.revert(
        ethers,
      );
    });
  });

  describe("최초 판매 자격 판정 (D9)", () => {
    it("발행 직후에는 최초 판매 자격이 있다 (TokenInfo를 _mint보다 먼저 기록)", async () => {
      const { nft, tokenId } = await networkHelpers.loadFixture(mintedFixture);
      expect(await nft.isPrimaryAvailable(tokenId)).to.equal(true);
    });

    it("플랫폼 밖에서 다른 주소로 전송하면 자격이 종료된다", async () => {
      const { nft, artist, user, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await nft.connect(artist).transferFrom(artist.address, user.address, tokenId);
      expect(await nft.isPrimaryAvailable(tokenId)).to.equal(false);
    });

    it("safeTransferFrom으로 외부에 보내도 자격이 종료된다", async () => {
      const { nft, artist, user, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await nft.connect(artist)["safeTransferFrom(address,address,uint256)"](artist.address, user.address, tokenId);
      expect(await nft.isPrimaryAvailable(tokenId)).to.equal(false);
    });

    it("아티스트가 승인한 대리인(operator)이 외부로 보내도 자격이 종료된다", async () => {
      const { nft, artist, user, buyer, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await nft.connect(artist).approve(user.address, tokenId);
      await nft.connect(user).transferFrom(artist.address, buyer.address, tokenId);
      expect(await nft.isPrimaryAvailable(tokenId)).to.equal(false);
    });

    it("외부로 보냈다가 아티스트가 돌려받아도 자격은 다시 생기지 않는다", async () => {
      const { nft, artist, user, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await nft.connect(artist).transferFrom(artist.address, user.address, tokenId);
      await nft.connect(user).transferFrom(user.address, artist.address, tokenId);
      expect(await nft.ownerOf(tokenId)).to.equal(artist.address);
      expect(await nft.isPrimaryAvailable(tokenId)).to.equal(false);
    });

    it("에스크로에 예치해도 자격이 유지된다", async () => {
      const { nft, artist, escrowAccount, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await deposit(nft, artist, escrowAccount, tokenId);
      expect(await nft.isPrimaryAvailable(tokenId)).to.equal(true);
    });

    it("에스크로에서 아티스트에게 반환되어도(거래 취소) 자격이 유지된다", async () => {
      const { nft, artist, escrowAccount, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await deposit(nft, artist, escrowAccount, tokenId);
      await nft.connect(escrowAccount).transferFrom(escrowAccount.address, artist.address, tokenId);
      expect(await nft.ownerOf(tokenId)).to.equal(artist.address);
      expect(await nft.isPrimaryAvailable(tokenId)).to.equal(true);
    });

    it("에스크로에서 구매자에게 이전되면(거래 완료) 자격이 종료된다", async () => {
      const { nft, artist, buyer, escrowAccount, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await deposit(nft, artist, escrowAccount, tokenId);
      await nft.connect(escrowAccount).transferFrom(escrowAccount.address, buyer.address, tokenId);
      expect(await nft.isPrimaryAvailable(tokenId)).to.equal(false);
    });

    it("재판매자가 에스크로에 예치했다가 반환받아도 종료된 자격은 그대로 유지된다", async () => {
      const { nft, artist, user, escrowAccount, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await nft.connect(artist).transferFrom(artist.address, user.address, tokenId); // 재판매자 user
      await deposit(nft, user, escrowAccount, tokenId);
      expect(await nft.isPrimaryAvailable(tokenId)).to.equal(false);
      await nft.connect(escrowAccount).transferFrom(escrowAccount.address, user.address, tokenId);
      expect(await nft.isPrimaryAvailable(tokenId)).to.equal(false);
    });

    it("다른 아티스트에게 전송해도 자격이 종료된다 (해당 토큰의 아티스트만 예외)", async () => {
      const { nft, artist, otherArtist, tokenId } = await networkHelpers.loadFixture(escrowSetFixture);
      await nft.connect(artist).transferFrom(artist.address, otherArtist.address, tokenId);
      expect(await nft.isPrimaryAvailable(tokenId)).to.equal(false);
    });

    it("에스크로가 등록되기 전에 외부로 전송해도 자격이 종료된다", async () => {
      const { nft, artist, user, tokenId } = await networkHelpers.loadFixture(mintedFixture);
      await nft.connect(artist).transferFrom(artist.address, user.address, tokenId);
      expect(await nft.isPrimaryAvailable(tokenId)).to.equal(false);
    });
  });

  describe("조회", () => {
    it("존재하지 않는 토큰 조회는 거부된다", async () => {
      const { nft } = await networkHelpers.loadFixture(mintedFixture);
      await expect(nft.getTokenInfo(99n))
        .to.be.revertedWithCustomError(nft, "ERC721NonexistentToken")
        .withArgs(99n);
      await expect(nft.isPrimaryAvailable(0n))
        .to.be.revertedWithCustomError(nft, "ERC721NonexistentToken")
        .withArgs(0n);
    });

    it("getTokens는 offset·limit 범위로 토큰 정보와 현재 소유자를 묶어서 돌려준다", async () => {
      const { nft, artist, user } = await networkHelpers.loadFixture(deployFixture);
      for (let i = 1; i <= 5; i++) {
        await nft.connect(artist).mint(`ipfs://cid-${i}`, PRICE * BigInt(i), Free, 0);
      }
      await nft.connect(artist).transferFrom(artist.address, user.address, 3n);

      const first = await nft.getTokens(0n, 2n);
      expect(first.map((t) => t.tokenId)).to.deep.equal([1n, 2n]);

      const rest = await nft.getTokens(2n, 10n);
      expect(rest.map((t) => t.tokenId)).to.deep.equal([3n, 4n, 5n]);
      expect(rest[0].owner).to.equal(user.address);
      expect(rest[0].primaryEnded).to.equal(true);
      expect(rest[0].tokenURI).to.equal("ipfs://cid-3");
      expect(rest[0].info.initialPrice).to.equal(PRICE * 3n);
      expect(rest[1].owner).to.equal(artist.address);
      expect(rest[1].primaryEnded).to.equal(false);

      expect(await nft.getTokens(5n, 1n)).to.have.length(0);
      expect(await nft.getTokens(0n, 0n)).to.have.length(0);
    });

    it("ERC721, AccessControl, 메타데이터 갱신(ERC4906) 인터페이스를 지원한다", async () => {
      const { nft } = await networkHelpers.loadFixture(deployFixture);
      expect(await nft.supportsInterface("0x80ac58cd")).to.equal(true); // ERC721
      expect(await nft.supportsInterface("0x5b5e139f")).to.equal(true); // ERC721Metadata
      expect(await nft.supportsInterface("0x7965db0b")).to.equal(true); // IAccessControl
      expect(await nft.supportsInterface("0x49064906")).to.equal(true); // ERC4906
      expect(await nft.supportsInterface("0xffffffff")).to.equal(false);
    });
  });
});

/**
 * 트랜잭션 오류 → 한국어 안내 문구 (lib/tx/errors.ts, docs/architecture.md 6.2·9장)
 * 로컬 Hardhat 노드에서 일부러 실패하는 호출을 보내고, 화면에 나갈 문구가 정책에 맞는지 확인한다.
 * 실행: `npm run test:tx` (먼저 `cd contracts; npm run compile`)
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Wallet, parseEther, type Contract, type ContractRunner } from "ethers";
import { toTxErrorMessage } from "@/lib/tx/errors";
import { CONFIRM_PERIOD, increaseTime, startLocalChain, type LocalChain } from "./localNode";

const PRICE = parseEther("0.1");
const URI = "ipfs://bafkreiac64jwaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CID = "bafkreiac64jwbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

let chain: LocalChain;

/** 실패해야 하는 호출의 오류. 성공하면 테스트 실패 */
async function failure(send: () => Promise<unknown>): Promise<unknown> {
  try {
    await send();
  } catch (error) {
    return error;
  }
  assert.fail("호출이 실패해야 하는데 성공했습니다.");
}

async function message(send: () => Promise<unknown>): Promise<string> {
  return toTxErrorMessage(await failure(send));
}

async function ok(send: () => Promise<{ wait: () => Promise<unknown> }>): Promise<void> {
  await (await send()).wait();
}

function as(contract: Contract, runner: ContractRunner): Contract {
  return contract.connect(runner) as Contract;
}

/** 다음 거래 번호 (listingCount + 1 = 방금 등록한 거래) */
async function lastListingId(): Promise<number> {
  return Number(await chain.escrow.getFunction("listingCount")());
}

before(async () => {
  chain = await startLocalChain();
});
after(async () => {
  await chain?.stop();
});

describe("트랜잭션 오류 안내 문구 (로컬 노드)", () => {
  let tokenId: number;
  let listingId: number;

  it("발행 권한 없음 / 활동명 빈칸 / 정책 수치 범위", async () => {
    const { nft, other, admin, artist } = chain;
    assert.match(await message(() => as(nft, other).getFunction("mint")(URI, PRICE, 0, 12_000)), /권한이 없습니다/);
    assert.match(await message(() => as(nft, other).getFunction("registerArtist")(other.address, "x")), /권한이 없습니다/);
    assert.equal(await message(() => as(nft, admin).getFunction("registerArtist")(other.address, "")), "활동명을 입력하세요.");
    assert.match(
      await message(() => as(nft, artist).getFunction("mint")(URI, PRICE, 0, 16_000)),
      /정책 수치가 허용 범위를 벗어났습니다/,
    );
    assert.equal(await message(() => as(nft, artist).getFunction("mint")("", PRICE, 0, 12_000)), "메타데이터 URI가 비어 있습니다.");

    await ok(() => as(nft, artist).getFunction("mint")(URI, PRICE, 0, 12_000)); // 정가 보호형 120%
    tokenId = Number(await nft.getFunction("totalMinted")());
  });

  it("판매 등록: 승인 없음(에스크로 안에서 난 NFT 오류) / 최초 판매가 불일치 / 소유자 아님", async () => {
    const { nft, escrow, artist, buyer } = chain;
    assert.match(
      await message(() => as(escrow, artist).getFunction("list")(tokenId, PRICE, CID)),
      /에스크로에 NFT 사용 승인이 되어 있지 않습니다/,
    );
    await ok(() => as(nft, artist).getFunction("approve")(chain.escrow.target, tokenId));
    assert.equal(
      await message(() => as(escrow, artist).getFunction("list")(tokenId, parseEther("0.2"), CID)),
      "최초 판매는 최초 판매가(0.1 ETH)로만 등록할 수 있습니다 (입력 0.2 ETH).",
    );
    assert.equal(await message(() => as(escrow, buyer).getFunction("list")(tokenId, PRICE, CID)), "NFT 소유자만 판매 등록할 수 있습니다.");
    assert.equal(await message(() => as(escrow, artist).getFunction("list")(tokenId, PRICE, "")), "상품 상태 기록 CID를 입력하세요.");

    await ok(() => as(escrow, artist).getFunction("list")(tokenId, PRICE, CID));
    listingId = await lastListingId();
  });

  it("구매: 본인 상품 / 금액 다름 / 없는 거래", async () => {
    const { escrow, artist, buyer } = chain;
    assert.equal(
      await message(() => as(escrow, artist).getFunction("buy")(listingId, { value: PRICE })),
      "자신이 등록한 상품은 구매할 수 없습니다.",
    );
    assert.equal(
      await message(() => as(escrow, buyer).getFunction("buy")(listingId, { value: parseEther("0.05") })),
      "결제 금액이 판매 가격과 다릅니다 (가격 0.1 ETH, 보낸 금액 0.05 ETH).",
    );
    assert.equal(await message(() => as(escrow, buyer).getFunction("cancelListing")(999)), "거래 #999을(를) 찾을 수 없습니다.");
    await ok(() => as(escrow, buyer).getFunction("buy")(listingId, { value: PRICE }));
  });

  it("수령 대기(LOCKED): 기한 전 정산 청구 / 구매자의 환불 / 판매자의 분쟁 제기 / 분쟁 없는 중재", async () => {
    const { escrow, artist, buyer, admin } = chain;
    assert.match(await message(() => as(escrow, artist).getFunction("claimAfterTimeout")(listingId)), /기한이 아직 지나지 않았습니다/);
    assert.equal(await message(() => as(escrow, buyer).getFunction("refundBySeller")(listingId)), "판매자만 할 수 있는 동작입니다.");
    assert.equal(await message(() => as(escrow, artist).getFunction("openDispute")(listingId)), "구매자만 할 수 있는 동작입니다.");
    assert.match(
      await message(() => as(escrow, admin).getFunction("resolveDispute")(listingId, true)),
      /현재 거래 상태\(구매 완료 · 수령 대기\)에서는 할 수 없는 동작입니다/,
    );
  });

  it("분쟁 중(DISPUTED): 판매자 환불·수령 승인 불가 / 관리자 아닌 중재 / 중복 중재", async () => {
    const { escrow, artist, buyer, admin, other } = chain;
    await ok(() => as(escrow, buyer).getFunction("openDispute")(listingId));
    assert.match(await message(() => as(escrow, artist).getFunction("refundBySeller")(listingId)), /현재 거래 상태\(분쟁 중\)/);
    assert.match(await message(() => as(escrow, buyer).getFunction("confirmReceipt")(listingId)), /현재 거래 상태\(분쟁 중\)/);
    assert.match(await message(() => as(escrow, buyer).getFunction("openDispute")(listingId)), /현재 거래 상태\(분쟁 중\)/);
    assert.match(
      await message(() => as(escrow, other).getFunction("resolveDispute")(listingId, false)),
      /권한이 없습니다.*분쟁 중재는 관리자 계정만/,
    );
    await ok(() => as(escrow, admin).getFunction("resolveDispute")(listingId, true)); // 구매자 환불
    assert.match(await message(() => as(escrow, admin).getFunction("resolveDispute")(listingId, false)), /현재 거래 상태\(취소됨\)/);
  });

  it("기한이 지나면 분쟁 제기 불가, 정산 청구 가능", async () => {
    const { nft, escrow, artist, buyer } = chain;
    // 환불로 NFT가 아티스트에게 돌아왔다. 최초 판매 자격은 그대로라 같은 가격으로 다시 등록한다 (D9)
    await ok(() => as(nft, artist).getFunction("approve")(chain.escrow.target, tokenId));
    await ok(() => as(escrow, artist).getFunction("list")(tokenId, PRICE, CID));
    const second = await lastListingId();
    await ok(() => as(escrow, buyer).getFunction("buy")(second, { value: PRICE }));
    await increaseTime(chain.provider, CONFIRM_PERIOD + 1);
    assert.equal(
      await message(() => as(escrow, buyer).getFunction("openDispute")(second)),
      "수령 승인 기한이 지나 분쟁을 제기할 수 없습니다.",
    );
    await ok(() => as(escrow, artist).getFunction("claimAfterTimeout")(second));
  });

  it("재판매 상한 초과 / 출금할 금액 없음", async () => {
    const { nft, escrow, buyer, other } = chain;
    await ok(() => as(nft, buyer).getFunction("approve")(chain.escrow.target, tokenId));
    assert.equal(
      await message(() => as(escrow, buyer).getFunction("list")(tokenId, parseEther("0.13"), CID)),
      "재판매 상한(0.12 ETH)을 넘는 가격입니다 (입력 0.13 ETH).",
    );
    assert.equal(await message(() => as(escrow, other).getFunction("withdraw")()), "출금할 금액이 없습니다.");
  });

  it("잔액 부족", async () => {
    const { nft, escrow, buyer, provider } = chain;
    await ok(() => as(escrow, buyer).getFunction("list")(tokenId, parseEther("0.12"), CID));
    const listing = await lastListingId();
    void nft;
    const poor = Wallet.createRandom().connect(provider);
    await provider.send("hardhat_setBalance", [poor.address, "0x" + parseEther("0.01").toString(16)]);
    assert.equal(
      await message(() => as(escrow, poor).getFunction("buy")(listing, { value: parseEther("0.12") })),
      "지갑 잔액이 부족합니다 (가격 + 가스비).",
    );
  });

  it("MetaMask가 감싼 오류도 같은 문구 (revert data를 ABI로 다시 해석)", async () => {
    const { escrow, other } = chain;
    const raw = (await failure(() => as(escrow, other).getFunction("withdraw")())) as { data?: string };
    assert.ok(raw.data?.startsWith("0x"), "revert data가 있어야 합니다");
    const wrapped = {
      code: -32603,
      message: "Internal JSON-RPC error.",
      data: { code: 3, message: "execution reverted", data: raw.data },
    };
    assert.equal(toTxErrorMessage(wrapped), "출금할 금액이 없습니다.");
    assert.equal(toTxErrorMessage({ code: 4001, message: "User rejected the request." }), "MetaMask에서 서명이 거부되었습니다.");
  });
});

/** 분쟁 사유 기록 (D15, architecture.md 6.8) */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DISPUTE_REASONS,
  checkDisputeImageCount,
  checkDisputeInput,
  disputeReasonLabel,
  disputeTagValue,
  isDisputeReason,
  parseDisputeRecord,
} from "@/lib/domain/dispute";
import { BUYER, CID_A, CID_B, CID_C, CID_D } from "./fixtures";

const LISTING = { listingId: 7, tokenId: 2, buyer: BUYER };
const RECORD = {
  type: "dispute",
  listingId: 7,
  tokenId: 2,
  buyer: BUYER.toUpperCase().replace("0X", "0x"),
  reason: "damaged",
  description: "",
  images: [CID_A],
  createdAt: "2026-11-28T00:00:00.000Z",
};

describe("분쟁 사유 입력 checkDisputeInput", () => {
  it("사유 5개 (D15)", () => {
    assert.deepEqual(
      DISPUTE_REASONS.map((r) => r.label),
      ["상품 미수령", "상태 기록과 다름", "배송 중 파손", "가품 의심", "기타"],
    );
    assert.equal(disputeReasonLabel("counterfeit"), "가품 의심");
    assert.equal(isDisputeReason("refund"), false);
  });
  it("사유를 고르지 않으면 거부", () => {
    assert.notEqual(checkDisputeInput({ reason: null, description: "설명" }), null);
  });
  it("설명은 \"기타\"일 때만 필수", () => {
    assert.notEqual(checkDisputeInput({ reason: "other", description: "  " }), null);
    assert.equal(checkDisputeInput({ reason: "other", description: "포장 상태" }), null);
    assert.equal(checkDisputeInput({ reason: "not_received", description: "" }), null);
  });
  it("설명 500자 경계", () => {
    assert.equal(checkDisputeInput({ reason: "damaged", description: "가".repeat(500) }), null);
    assert.notEqual(checkDisputeInput({ reason: "damaged", description: "가".repeat(501) }), null);
  });
  it("사진 0~3장 (선택)", () => {
    assert.equal(checkDisputeImageCount(0), null);
    assert.equal(checkDisputeImageCount(3), null);
    assert.notEqual(checkDisputeImageCount(4), null);
  });
});

describe("분쟁 사유 기록 해석 parseDisputeRecord", () => {
  it("이 거래·구매자의 기록이면 읽는다 (주소 대소문자 무시)", () => {
    assert.equal(parseDisputeRecord(RECORD, LISTING)?.reason, "damaged");
  });
  it("다른 거래·NFT·구매자의 기록은 버린다", () => {
    assert.equal(parseDisputeRecord({ ...RECORD, listingId: 8 }, LISTING), null);
    assert.equal(parseDisputeRecord({ ...RECORD, tokenId: 3 }, LISTING), null);
    assert.equal(parseDisputeRecord({ ...RECORD, buyer: "0x" + "4".repeat(40) }, LISTING), null);
    assert.equal(parseDisputeRecord(RECORD, { ...LISTING, buyer: null }), null);
  });
  it("형식이 맞지 않으면 버린다", () => {
    const broken = [
      null,
      [],
      { ...RECORD, type: "resale" },
      { ...RECORD, reason: "refund" },
      { ...RECORD, description: 3 },
      { ...RECORD, description: "가".repeat(501) },
      { ...RECORD, images: [CID_A, CID_B, CID_C, CID_D] },
      { ...RECORD, images: ["https://example.com/a.png"] },
      { ...RECORD, createdAt: undefined },
    ];
    for (const value of broken) assert.equal(parseDisputeRecord(value, LISTING), null, JSON.stringify(value));
  });
});

describe("Pinata 꼬리표 값 disputeTagValue", () => {
  it("체인·에스크로 주소(소문자)·거래 번호로 구분한다", () => {
    assert.equal(disputeTagValue(11155111, "0xE6966F582D3e61656BBaF3C43607732181F58c60", 7), "11155111:0xe6966f582d3e61656bbaf3c43607732181f58c60:7");
    assert.notEqual(disputeTagValue(31337, "0xabc", 7), disputeTagValue(11155111, "0xabc", 7));
  });
});

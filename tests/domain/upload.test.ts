/** 업로드 입력 확인과 서명 문장 (D11·D12·D13·D15) */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTokenName } from "@/lib/domain/metadata";
import {
  MAX_IMAGE_BYTES,
  buildUploadMessage,
  checkConditionForm,
  checkImageCount,
  checkImageFile,
  checkMetadataInput,
  isCid,
  type UploadAuthFields,
} from "@/lib/domain/upload";
import { CID_A } from "./fixtures";

const AUTH: UploadAuthFields = {
  purpose: "condition",
  tokenId: 3,
  listingId: null,
  address: "0xAbCd000000000000000000000000000000000001",
  chainId: 11155111,
  issuedAt: 1_700_000_000,
};

describe("업로드 확인 서명 문장 buildUploadMessage", () => {
  it("상품 상태 기록 문장 (바뀌면 이전 서명이 무효가 되므로 고정)", () => {
    assert.equal(
      buildUploadMessage(AUTH),
      [
        "B-SIDE 업로드 확인",
        "용도: 상품 상태 기록 (NFT #3)",
        "지갑: 0xabcd000000000000000000000000000000000001",
        "체인: 11155111",
        "시각: 1700000000",
        "이 서명은 가스비가 들지 않으며 거래를 실행하지 않습니다.",
      ].join("\n"),
    );
  });
  it("용도별 문장: 발행 메타데이터, 분쟁 사유(거래 번호 포함)", () => {
    assert.match(buildUploadMessage({ ...AUTH, purpose: "metadata", tokenId: null }), /용도: NFT 발행 메타데이터/);
    assert.match(
      buildUploadMessage({ ...AUTH, purpose: "dispute", tokenId: null, listingId: 7 }),
      /용도: 분쟁 사유 기록 \(거래 #7\)/,
    );
  });
  it("용도·NFT·거래 번호·체인·시각이 다르면 다른 문장 (서명 재사용 방지)", () => {
    const base = buildUploadMessage(AUTH);
    for (const changed of [
      { tokenId: 4 },
      { chainId: 31337 },
      { issuedAt: 1_700_000_001 },
      { purpose: "metadata" as const },
    ]) {
      assert.notEqual(buildUploadMessage({ ...AUTH, ...changed }), base);
    }
    const dispute = { ...AUTH, purpose: "dispute" as const, tokenId: null };
    assert.notEqual(buildUploadMessage({ ...dispute, listingId: 1 }), buildUploadMessage({ ...dispute, listingId: 2 }));
  });
});

describe("상품 상태 입력 (D11, D14)", () => {
  const valid = { sealed: false, condition: "1회 청음", defects: "" };
  it("정상 입력 통과", () => assert.equal(checkConditionForm(valid), null));
  it("개봉 여부를 고르지 않으면 거부 (기본 선택 없음, D14)", () => {
    assert.notEqual(checkConditionForm({ ...valid, sealed: null }), null);
  });
  it("사용 상태 빈칸·공백만 거부", () => {
    assert.notEqual(checkConditionForm({ ...valid, condition: "   " }), null);
  });
  it("1000자 초과 거부", () => {
    assert.notEqual(checkConditionForm({ ...valid, condition: "가".repeat(1001) }), null);
    assert.notEqual(checkConditionForm({ ...valid, defects: "가".repeat(1001) }), null);
  });
  it("사진 1~5장", () => {
    assert.notEqual(checkImageCount(0), null);
    assert.equal(checkImageCount(1), null);
    assert.equal(checkImageCount(5), null);
    assert.notEqual(checkImageCount(6), null);
  });
  it("사진 형식·크기 (JPEG·PNG·WebP, 4MB)", () => {
    assert.equal(checkImageFile({ type: "image/png", size: MAX_IMAGE_BYTES }), null);
    assert.notEqual(checkImageFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1 }), null);
    assert.notEqual(checkImageFile({ type: "image/gif", size: 10 }), null);
  });
});

describe("발행 메타데이터 입력 (D13)", () => {
  it("이름·설명 필수, 길이 제한", () => {
    assert.equal(checkMetadataInput({ name: "LP", description: "설명" }), null);
    assert.notEqual(checkMetadataInput({ name: " ", description: "설명" }), null);
    assert.notEqual(checkMetadataInput({ name: "LP", description: "" }), null);
    assert.notEqual(checkMetadataInput({ name: "a".repeat(101), description: "설명" }), null);
  });
  it("메타데이터에서 상품 이름 읽기 (공백 정리, 100자 + 말줄임)", () => {
    assert.equal(parseTokenName({ name: "  201\n LP " }), "201 LP");
    assert.equal(parseTokenName({ name: "a".repeat(150) }), "a".repeat(100) + "…");
    for (const value of [null, [], "LP", { name: "" }, { name: 3 }, {}]) assert.equal(parseTokenName(value), null);
  });
});

describe("CID 형식", () => {
  it("v0·v1 통과, 그 외 거부 (서버가 임의 URL을 요청하지 않도록)", () => {
    assert.equal(isCid(CID_A), true);
    assert.equal(isCid("Qm" + "a".repeat(44)), true);
    for (const value of ["", "ipfs://" + CID_A, "https://example.com", "bafy", 123]) assert.equal(isCid(value), false);
  });
});

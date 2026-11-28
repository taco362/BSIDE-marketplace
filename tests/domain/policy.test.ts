/** 가격 규칙·정책 수치 (D1·D3·D9·D10). 컨트랙트 판정(architecture.md 4.2)과 같은 결과를 내야 한다 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkListingPrice,
  formatBps,
  isPrimarySale,
  listingPriceRule,
  percentToBps,
  primarySaleState,
  resaleCap,
} from "@/lib/domain/policy";
import { checkPolicyBps } from "@/lib/domain/validation";
import { ARTIST, ETH, SELLER, listing, token } from "./fixtures";

describe("판매 가격 규칙 listingPriceRule", () => {
  it("아티스트가 최초 판매 자격이 있으면 최초 판매가 고정 (D1)", () => {
    assert.deepEqual(listingPriceRule(token(), ARTIST), { kind: "primary", price: ETH / BigInt(10) });
  });
  it("주소 대소문자가 달라도 같은 아티스트로 본다", () => {
    assert.equal(isPrimarySale(token(), ARTIST.toUpperCase().replace("0X", "0x")), true);
  });
  it("최초 판매 자격이 끝난 아티스트는 재판매 규칙 (D9·D10)", () => {
    assert.equal(listingPriceRule(token({ primaryEnded: true }), ARTIST).kind, "cap");
  });
  it("정가 보호형 재판매는 상한 = 최초 판매가 × bps (소수점 버림)", () => {
    assert.deepEqual(listingPriceRule(token(), SELLER), { kind: "cap", cap: (ETH * BigInt(12)) / BigInt(100) });
    assert.equal(resaleCap(token({ initialPrice: BigInt(3), policyBps: 12_500 })), BigInt(3)); // 3.75 → 3
  });
  it("창작자 상생형·자유 거래형 재판매는 가격 제한 없음", () => {
    assert.deepEqual(listingPriceRule(token({ policy: "Royalty", policyBps: 500 }), SELLER), { kind: "free" });
    assert.deepEqual(listingPriceRule(token({ policy: "Free", policyBps: 0 }), SELLER), { kind: "free" });
  });
});

describe("판매 가격 확인 checkListingPrice", () => {
  const cap = { kind: "cap", cap: BigInt(1_000) } as const;
  it("0 이하 거부", () => {
    assert.notEqual(checkListingPrice({ kind: "free" }, BigInt(0)), null);
  });
  it("최초 판매가와 다르면 거부", () => {
    assert.notEqual(checkListingPrice({ kind: "primary", price: BigInt(5) }, BigInt(6)), null);
    assert.equal(checkListingPrice({ kind: "primary", price: BigInt(5) }, BigInt(5)), null);
  });
  it("상한 경계: 정확히 상한은 통과, 상한 + 1 wei는 거부", () => {
    assert.equal(checkListingPrice(cap, BigInt(1_000)), null);
    assert.notEqual(checkListingPrice(cap, BigInt(1_001)), null);
  });
});

describe("정책 수치 (D3)", () => {
  it("퍼센트 → bps", () => {
    assert.equal(percentToBps("120"), 12_000);
    assert.equal(percentToBps("2.5"), 250);
    assert.equal(percentToBps(" 7.25 "), 725);
  });
  it("잘못된 퍼센트 형식은 null", () => {
    for (const text of ["", "abc", "1.234", "-5", "1e2"]) assert.equal(percentToBps(text), null, text);
  });
  it("정가 보호형 100~150%, 창작자 상생형 1~10% 경계", () => {
    assert.equal(checkPolicyBps("PriceCap", 10_000), null);
    assert.equal(checkPolicyBps("PriceCap", 15_000), null);
    assert.notEqual(checkPolicyBps("PriceCap", 9_999), null);
    assert.notEqual(checkPolicyBps("PriceCap", 15_001), null);
    assert.equal(checkPolicyBps("Royalty", 100), null);
    assert.notEqual(checkPolicyBps("Royalty", 1_001), null);
    assert.notEqual(checkPolicyBps("Royalty", null), null);
    assert.equal(checkPolicyBps("Free", null), null);
  });
  it("bps 표시", () => {
    assert.equal(formatBps(12_500), "125%");
    assert.equal(formatBps(250), "2.5%");
  });
});

describe("최초 판매 표시 상태 primarySaleState (D9)", () => {
  it("자격이 남아 있으면 available", () => {
    assert.equal(primarySaleState(token(), []), "available");
  });
  it("최초 판매 거래가 완료됐으면 soldOnPlatform", () => {
    assert.equal(primarySaleState(token({ primaryEnded: true }), [listing({ isPrimary: true })]), "soldOnPlatform");
  });
  it("최초 판매가 취소되기만 하고 자격이 끝났으면 endedOffPlatform", () => {
    const cancelled = listing({ isPrimary: true, status: "CANCELLED" });
    assert.equal(primarySaleState(token({ primaryEnded: true }), [cancelled]), "endedOffPlatform");
  });
});

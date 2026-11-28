/** 상품 상태 기록 해석과 모순 경고 (U4, 6.7 A1) */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conditionHistoryWarnings, priorCompletedListings, toPriorConditions } from "@/lib/domain/conditionHistory";
import { cidFromIpfsUri, conditionRecordWarnings, parseConditionRecord } from "@/lib/domain/conditionRecord";
import { CID_A, CID_B, SELLER, listing } from "./fixtures";

const RESALE = {
  type: "resale",
  tokenId: 1,
  seller: SELLER,
  sealed: false,
  condition: "1회 청음",
  defects: "자켓 모서리 눌림",
  images: [CID_A],
  createdAt: "2026-11-28T00:00:00.000Z",
};

describe("상태 기록 해석 parseConditionRecord", () => {
  it("재판매 기록", () => {
    assert.equal(parseConditionRecord(RESALE)?.type, "resale");
  });
  it("type이 없는 이전 기록은 재판매 기록으로 읽는다", () => {
    const old: Partial<typeof RESALE> = { ...RESALE };
    delete old.type;
    assert.equal(parseConditionRecord(old)?.type, "resale");
  });
  it("aiAssisted는 true일 때만 남긴다", () => {
    const marked = parseConditionRecord({ ...RESALE, aiAssisted: true });
    assert.ok(marked && marked.type === "resale" && marked.aiAssisted === true);
    const record = parseConditionRecord({ ...RESALE, aiAssisted: "yes" });
    assert.ok(record && record.type === "resale" && !("aiAssisted" in record));
  });
  it("최초 판매 기록은 metadata 필수", () => {
    const primary = { type: "primary", tokenId: 1, seller: SELLER, condition: "아티스트 최초 판매 상품", images: [], createdAt: "x" };
    assert.equal(parseConditionRecord(primary), null);
    assert.equal(parseConditionRecord({ ...primary, metadata: `ipfs://${CID_B}` })?.type, "primary");
  });
  it("형식이 맞지 않으면 null", () => {
    const broken = [
      null,
      [],
      { ...RESALE, tokenId: "1" },
      { ...RESALE, seller: "0x12" },
      { ...RESALE, sealed: "no" },
      { ...RESALE, images: [CID_A, CID_A, CID_A, CID_A, CID_A, CID_A] },
      { ...RESALE, images: ["https://example.com/a.png"] },
      { ...RESALE, type: "dispute" },
    ];
    for (const value of broken) assert.equal(parseConditionRecord(value), null, JSON.stringify(value));
  });
  it("ipfs:// URI에서 CID 꺼내기", () => {
    assert.equal(cidFromIpfsUri(`ipfs://${CID_A}`), CID_A);
    assert.equal(cidFromIpfsUri(CID_A), null);
    assert.equal(cidFromIpfsUri("ipfs://not-a-cid"), null);
  });
});

describe("기록과 거래가 어긋남 conditionRecordWarnings", () => {
  const record = parseConditionRecord(RESALE)!;
  it("일치하면 경고 없음 (주소 대소문자 무시)", () => {
    assert.deepEqual(conditionRecordWarnings(record, { tokenId: 1, seller: SELLER.toUpperCase().replace("0X", "0x"), isPrimary: false }), []);
  });
  it("NFT 번호·판매자가 다르면 경고", () => {
    assert.equal(conditionRecordWarnings(record, { tokenId: 2, seller: "0x" + "4".repeat(40), isPrimary: false }).length, 2);
  });
});

describe("모순 경고 (A1)", () => {
  const listings = [
    listing({ listingId: 1, status: "COMPLETED" }),
    listing({ listingId: 2, status: "CANCELLED" }),
    listing({ listingId: 3, status: "COMPLETED" }),
    listing({ listingId: 4, status: "LISTED" }),
  ];
  it("비교 대상은 앞선 완료 거래만", () => {
    assert.deepEqual(priorCompletedListings(listings, 4).map((l) => l.listingId), [1, 3]);
    assert.deepEqual(priorCompletedListings(listings, 3).map((l) => l.listingId), [1]);
  });
  it("거래와 맞지 않는 기록·읽지 못한 기록·최초 판매 기록은 비교에서 뺀다", () => {
    const ok = { status: "ok" as const, record: parseConditionRecord(RESALE)! };
    const prior = toPriorConditions([
      { listing: listings[0], result: ok },
      { listing: listing({ listingId: 3, seller: "0x" + "5".repeat(40) }), result: ok },
      { listing: listing({ listingId: 5 }), result: { status: "unavailable" } },
    ]);
    assert.deepEqual(prior, [{ listingId: 1, sealed: false, defects: "자켓 모서리 눌림" }]);
  });
  it("이전에 개봉 → 지금 미개봉이면 강한 경고", () => {
    const warnings = conditionHistoryWarnings({ sealed: true, defects: "없음" }, [{ listingId: 1, sealed: false, defects: "없음" }]);
    assert.deepEqual(warnings.map((w) => w.level), ["strong"]);
  });
  it("직전 하자가 이번에 \"없음\"(빈칸 포함)이면 주의", () => {
    const prior = [{ listingId: 1, sealed: false, defects: "모서리 눌림" }];
    assert.deepEqual(conditionHistoryWarnings({ sealed: false, defects: "  " }, prior).map((w) => w.level), ["caution"]);
    assert.deepEqual(conditionHistoryWarnings({ sealed: false, defects: "모서리 눌림" }, prior), []);
  });
  it("미개봉 → 개봉, 이전 기록 없음은 경고 없음", () => {
    assert.deepEqual(conditionHistoryWarnings({ sealed: false, defects: "없음" }, [{ listingId: 1, sealed: true, defects: "없음" }]), []);
    assert.deepEqual(conditionHistoryWarnings({ sealed: true, defects: "없음" }, []), []);
  });
});

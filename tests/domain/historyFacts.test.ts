/** AI 이력 요약의 사실 목록과 숫자 확인 (6.7 A3) */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHistoryFacts, unknownNumbers } from "@/lib/domain/historyFacts";
import type { ConditionRecordResult } from "@/lib/domain/conditionRecord";
import { ARTIST, CID_A, ETH, SELLER, listing, token } from "./fixtures";

function resale(listingId: number, seller: string, sealed: boolean, defects: string): [number, ConditionRecordResult] {
  return [
    listingId,
    {
      status: "ok",
      record: { type: "resale", tokenId: 1, seller, sealed, condition: "상태", defects, images: [CID_A], createdAt: "x" },
    },
  ];
}

describe("사실 목록 buildHistoryFacts", () => {
  const listings = [
    listing({ listingId: 1, seller: ARTIST, isPrimary: true, price: ETH / BigInt(10) }),
    listing({ listingId: 2, seller: SELLER, price: ETH / BigInt(8) }),
    listing({ listingId: 3, seller: "0x" + "3".repeat(40), price: ETH / BigInt(5), status: "LISTED" }),
  ];
  const records = Object.fromEntries([
    [1, { status: "ok", record: { type: "primary", tokenId: 1, seller: ARTIST, condition: "x", metadata: "x", images: [], createdAt: "x" } }],
    resale(2, SELLER, false, "없음"),
    resale(3, "0x" + "3".repeat(40), true, "없음"),
  ]) as Record<number, ConditionRecordResult>;
  const facts = buildHistoryFacts(token({ primaryEnded: true }), listings, records);

  it("거래 건수를 코드로 센다", () => {
    assert.ok(facts.lines.some((l) => l.includes("등록 3건 중 완료 2건, 취소 0건, 진행 중 1건")));
  });
  it("완료 거래 가격 변화", () => {
    assert.ok(facts.lines.some((l) => l.includes("처음 0.1 ETH(거래 #1) → 마지막 0.125 ETH(거래 #2)")));
  });
  it("개봉 → 미개봉 모순을 경고로 넣는다", () => {
    assert.equal(facts.hasWarnings, true);
    assert.ok(facts.lines.some((l) => l.startsWith("거래 #3") && l.includes("경고(불일치)")));
  });
  it("같은 사실이면 같은 캐시 키", () => {
    assert.equal(buildHistoryFacts(token({ primaryEnded: true }), listings, records).key, facts.key);
  });
  it("읽지 못한 기록은 그렇게 적는다", () => {
    const f = buildHistoryFacts(token(), [listing({ listingId: 1 })], {});
    assert.ok(f.lines.some((l) => l.includes("상태 기록 읽지 못함")));
    assert.equal(f.hasWarnings, false);
  });
});

describe("요약 숫자 확인 unknownNumbers", () => {
  const facts = { numbers: new Set(["0.1", "0.125", "3"]) };
  it("사실 목록에 있는 숫자와 0~10 정수는 허용", () => {
    assert.deepEqual(unknownNumbers("3건 중 2번째 거래가 0.125 ETH였습니다.", facts), []);
  });
  it("없는 숫자는 찾아낸다 (AI가 지어낸 가격·횟수)", () => {
    assert.deepEqual(unknownNumbers("0.5 ETH로 12번 거래", facts), ["0.5", "12"]);
  });
});

/**
 * AI 거래 이력 요약 (docs/architecture.md 6.7 A3, proposal.md D14)
 * JSON: { tokenId }. 조회 기능이라 서명을 받지 않는다 (proposal.md 3장: 조회는 지갑 불필요).
 * 서버가 거래·상태 기록을 직접 다시 읽어 사실 목록을 만든다 (브라우저가 보낸 이력은 받지 않음).
 * 응답: 200 { summary, ai } (ai: AI가 쓴 문장인지) / 오류 { error } + 상태 코드
 */
import { getCachedSummary, setCachedSummary } from "@/lib/ai/summaryCache";
import { toAiErrorResponse } from "@/lib/ai/errors";
import { AiError } from "@/lib/ai/gemini";
import { takeAiCall } from "@/lib/ai/rateLimit";
import { summarizeHistory } from "@/lib/ai/tokenSummary";
import { getMarketReader } from "@/lib/data";
import { getConditionRecord } from "@/lib/data/ipfs/conditionRecords";
import { buildHistoryFacts } from "@/lib/domain/historyFacts";
import { UploadError } from "@/lib/upload/errors";

const MAX_REQUEST_BYTES = 1024;

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) throw new UploadError(413, "요청이 너무 큽니다.");
    const body = (await request.json().catch(() => null)) as { tokenId?: unknown } | null;
    const tokenId = Number(body?.tokenId);
    if (!Number.isSafeInteger(tokenId) || tokenId <= 0) throw new UploadError(400, "NFT 번호가 올바르지 않습니다.");

    const reader = getMarketReader();
    const [token, listings] = await Promise.all([reader.getToken(tokenId), reader.getListingsByToken(tokenId)]);
    if (!token) throw new UploadError(400, `NFT #${tokenId}이(가) 없습니다.`);
    // 거래가 없으면 요약할 것이 없다. AI를 부르지 않는다 (비용 절약)
    if (listings.length === 0) return Response.json({ summary: "아직 B-SIDE 플랫폼 거래 이력이 없습니다.", ai: false });

    const results = await Promise.all(listings.map((l) => getConditionRecord(l.conditionCID)));
    const records = Object.fromEntries(listings.map((l, i) => [l.listingId, results[i]]));
    const facts = buildHistoryFacts(token, listings, records);

    const cached = getCachedSummary(facts.key);
    if (cached) return Response.json({ summary: cached, ai: true });
    if (!takeAiCall()) throw new AiError("busy", "호출 횟수 제한");

    const summary = await summarizeHistory(facts);
    setCachedSummary(facts.key, summary);
    return Response.json({ summary, ai: true });
  } catch (error) {
    return toAiErrorResponse(error);
  }
}

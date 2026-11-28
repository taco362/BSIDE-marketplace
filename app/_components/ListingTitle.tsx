/**
 * 판매 목록 카드 제목: 상품 이름 (메타데이터 name). 부모가 <Suspense fallback={<ListingTitleText …/>}>로 감싼다.
 * 이름이 없거나 읽지 못하면 "NFT #n"으로 대신 표시한다.
 */
export async function ListingTitle({ tokenId, name }: { tokenId: number; name: Promise<string | null> }) {
  return <ListingTitleText text={(await name) ?? fallbackTitle(tokenId)} />;
}

export function ListingTitleText({ text }: { text: string }) {
  return (
    <p className="truncate font-medium" title={text}>
      {text}
    </p>
  );
}

export function fallbackTitle(tokenId: number): string {
  return `NFT #${tokenId}`;
}

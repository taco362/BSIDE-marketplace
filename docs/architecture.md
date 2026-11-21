# B-SIDE — 시스템 아키텍처

> 이 문서는 B-SIDE를 **어떻게 구현하는가**를 정의한다.
> 서비스 요구사항과 정책 결정(D1~D10)은 [proposal.md](proposal.md)가 기준이며, 이 문서는 그 결정을 따른다.
> 정책과 이 문서가 충돌하면 proposal.md를 우선하고, 이 문서를 수정한다.
> 상태: 설계 확정, 구현 전 (진행 상황은 [progress.md](progress.md))

## 1. 설계 원칙

- **핵심 정보는 온체인**: NFT 소유권, 재판매 정책, 거래 상태, 예치금, 정산 여부는 스마트 컨트랙트가 관리한다.
- **상세 정보는 IPFS**: 상품 설명, 상태 정보, 사진, NFT 메타데이터는 IPFS(Pinata)에 저장하고 CID를 온체인에 연결한다.
- **현재 상태는 컨트랙트 상태값, 이력은 이벤트**: 화면에 보이는 거래 상태는 항상 컨트랙트 상태값을 기준으로 판단한다.
- **DB 없음, 교체 가능한 조회 계층**: 화면은 조회 인터페이스(`MarketReader`)에만 의존하며, 나중에 PostgreSQL 구현체로 교체할 수 있다.
- **MVP 최소 구성**: 시연에 필요한 범위에서 컨트랙트 상태와 인덱스를 최소화한다.

## 2. 시스템 구성

```
┌───────────────────────── 브라우저 ─────────────────────────┐
│  Next.js 페이지 (Client Component)                          │
│   - 지갑 연결, 트랜잭션 서명 (MetaMask + ethers.js)          │
└──────┬──────────────────────────────┬──────────────────────┘
       │ 쓰기: 트랜잭션 전송           │ 읽기: 페이지 요청 / 업로드
       ▼                              ▼
┌──────────────┐         ┌──────────────────────────────────┐
│ Ethereum     │◀─조회───│ Next.js 서버                      │
│ Sepolia      │  (RPC)  │  - Server Component: MarketReader │
│ ├ BSideNFT   │         │  - Route Handler: /api/ipfs       │
│ └ BSideEscrow│         │    (PINATA_JWT 서버 전용)          │
└──────────────┘         └───────────────┬──────────────────┘
                                         │ 업로드
                                         ▼
                                  ┌──────────────┐
                                  │ Pinata (IPFS)│
                                  └──────────────┘
```

- 쓰기(발행, 판매 등록, 구매, 승인 등)는 브라우저에서 사용자가 MetaMask로 직접 서명한다. 서버는 개인키를 다루지 않는다.
- 읽기는 서버에서 RPC로 컨트랙트를 조회한다. RPC URL은 서버 전용 환경 변수로 관리한다.
- IPFS 업로드는 서버의 Route Handler를 거친다.

## 3. 디렉터리 구조

기존 Next.js 프로젝트 구조(`app/`)를 유지하고, 컨트랙트는 `contracts/`에 별도 Hardhat 프로젝트로 둔다.

```
b-side/
├─ app/
│  ├─ layout.tsx                # WalletProvider로 감싼다
│  ├─ page.tsx                  # 판매 중 상품 목록
│  ├─ listings/[id]/page.tsx    # 거래 상세 + 구매/승인/환불/분쟁 버튼
│  ├─ tokens/[tokenId]/page.tsx # NFT 정보, 정책, 거래 이력
│  ├─ mint/page.tsx             # 아티스트 NFT 발행
│  ├─ sell/page.tsx             # 보유 NFT 선택 → 판매 등록
│  ├─ my/page.tsx               # 내 NFT, 판매·구매 거래, 출금
│  ├─ admin/page.tsx            # 아티스트 등록/회수, 분쟁 중재
│  └─ api/ipfs/route.ts         # Pinata 업로드 (Phase 2)
├─ lib/
│  ├─ contracts/                # 배포 스크립트가 생성: ABI, 주소, 배포 블록, chainId
│  ├─ data/
│  │  ├─ types.ts               # 도메인 타입 (Listing, TokenInfo, TradeEvent)
│  │  ├─ reader.ts              # MarketReader 인터페이스
│  │  ├─ chain/chainReader.ts   # 블록체인 조회 구현체 (server-only)
│  │  └─ index.ts               # getMarketReader(): DATA_SOURCE로 구현체 선택
│  ├─ wallet/                   # 지갑 연결, 네트워크 확인 (client)
│  ├─ tx/                       # 트랜잭션 전송 함수 (client)
│  ├─ ipfs/pinata.ts            # Pinata 업로드 (server-only, Phase 2)
│  └─ config/sampleCids.ts      # Phase 1 테스트용 샘플 CID
├─ contracts/                   # Hardhat 프로젝트 (별도 package.json)
│  ├─ contracts/BSideNFT.sol
│  ├─ contracts/BSideEscrow.sol
│  ├─ contracts/test/           # 테스트용 공격·거부 컨트랙트
│  ├─ test/
│  └─ scripts/deploy.ts
└─ docs/
```

> Next.js 16은 이전 버전과 API가 다를 수 있다. Next.js 코드를 작성하기 전에 `node_modules/next/dist/docs/`의 해당 문서를 확인한다(AGENTS.md).

## 4. 스마트 컨트랙트 설계

### 4.1 BSideNFT

상속: ERC721, ERC721URIStorage, AccessControl (OpenZeppelin 5.x)

| 항목 | 내용 |
|---|---|
| Role | `DEFAULT_ADMIN_ROLE`(관리자), `ARTIST_ROLE`(승인된 아티스트) |
| 정책 타입 | `enum Policy { PriceCap, Royalty, Free }` |
| 토큰 정보 | `TokenInfo { address artist; uint256 initialPrice; Policy policy; uint16 policyBps; }` |
| 최초 판매 상태 | `mapping(uint256 => bool) primaryEnded` |

함수:

| 함수 | 호출자 | 설명 |
|---|---|---|
| `grantRole(ARTIST_ROLE, addr)` / `revokeRole` | 관리자 | 아티스트 등록·회수 (D7) |
| `mint(uri, initialPrice, policy, policyBps)` | `ARTIST_ROLE` | msg.sender에게 발행. TokenInfo 기록 |
| `setEscrow(addr)` | 관리자 | 에스크로 주소 등록. **1회만 호출 가능** |
| `getTokenInfo(id)` | 누구나 | 토큰 정보 조회 |
| `isPrimaryAvailable(id)` | 누구나 | `!primaryEnded[id]` |
| `totalMinted()` | 누구나 | 발행된 토큰 수 |
| `getTokens(offset, limit)` | 누구나 | TokenInfo + 현재 소유자를 묶음으로 조회 |

발행 검증:
- `uri`는 비어 있으면 안 된다.
- `initialPrice > 0`
- `policyBps` 범위 (D3): PriceCap은 10000~15000, Royalty는 100~1000, Free는 0. 범위를 벗어나면 revert한다.
- **TokenInfo를 수정하는 함수는 없다.** 관리자도 정책을 변경할 수 없다.

최초 판매 판정 (D9):
- `_update`를 override해서, 전송받는 주소 `to`가 `0`(소각), 해당 토큰의 `artist`, `escrow` 중 어느 것도 아니면 `primaryEnded[tokenId] = true`로 기록한다.
- 결과적으로 다음 경우에 최초 판매가 끝난다.
  - 플랫폼 밖에서 아티스트가 다른 주소로 전송한 경우
  - 에스크로 거래가 완료되어 NFT가 구매자에게 이전된 경우
- 다음 경우에는 최초 판매가 유지된다.
  - 발행 직후 (아티스트 소유)
  - 에스크로에 예치된 경우
  - 거래가 취소되어 에스크로에서 아티스트에게 반환된 경우
- 구현 주의: `mint`에서 TokenInfo(`artist`)를 `_mint` 호출 **이전에** 기록해야 한다. 순서가 바뀌면 발행 시점에 `artist`가 0으로 읽혀 `primaryEnded`가 잘못 true가 된다. 테스트로 확인한다.
- 이전 설계(에스크로의 첫 거래 완료 여부로 판정)는 외부에서 팔았다가 돌려받은 NFT를 최초 판매로 잘못 판정하는 문제가 있어 이 방식으로 변경했다.

### 4.2 BSideEscrow

상속: ReentrancyGuard, AccessControl. **IERC721Receiver는 구현하지 않는다** (5.2 참고).

| 항목 | 내용 |
|---|---|
| Role | `DEFAULT_ADMIN_ROLE`, `ARBITER_ROLE`(분쟁 중재) |
| 불변값 | `nft`(BSideNFT 주소), `confirmPeriod`(초) — constructor에서 설정, `immutable` |
| 거래 상태 | `enum Status { LISTED, LOCKED, COMPLETED, CANCELLED, DISPUTED }` |
| 거래 정보 | `Listing { tokenId, seller, buyer, price, conditionCID, status, isPrimary, listedAt, lockedAt, closedAt }` |
| 거래 저장 | `mapping(uint256 => Listing) listings`, `listingCount` |
| 출금 대기액 | `mapping(address => uint256) pendingWithdrawals` |

판매 등록 시 가격 규칙:

| 구분 | 판정 | 가격 조건 |
|---|---|---|
| 최초 판매 (D1, D9) | `seller == artist && nft.isPrimaryAvailable(tokenId)` | `price == initialPrice` |
| 재판매 — 정가 보호형 | 그 외 | `price ≤ initialPrice × policyBps / 10000` |
| 재판매 — 창작자 상생형, 자유 거래형 | 그 외 | `price > 0` |

- 최초 판매 여부는 판매 등록 시점에 판정해 `isPrimary`로 저장한다.
- 아티스트가 최초 판매 이후 다시 판매하는 경우 일반 재판매와 같은 규칙을 적용한다 (D10).

로열티 계산 (거래 완료 시):
- `policy == Royalty && !isPrimary && seller != artist`이면 `royalty = price × policyBps / 10000` (소수점 이하 버림)
- 그 외에는 `royalty = 0`. 판매자가 아티스트인 경우 로열티 수령자가 판매자 본인이므로 0으로 기록하며, 실제 수령액은 같다 (D10).
- `sellerAmount = price − royalty`. 나머지가 남지 않는다.

### 4.3 상태 전이

```
             list()
 (NFT 보유) ─────────▶ LISTED ───cancelListing()──▶ CANCELLED
                         │
                         │ buy() + ETH
                         ▼
                       LOCKED ───refundBySeller()──▶ CANCELLED
                       │    │
   confirmReceipt()    │    │ openDispute()  (now < deadline)
   claimAfterTimeout() │    ▼
   (now ≥ deadline)    │  DISPUTED ──resolveDispute(true)──▶ CANCELLED
                       ▼    │
                  COMPLETED ◀──resolveDispute(false)──┘
```

`deadline = lockedAt + confirmPeriod`

| 함수 | 호출자 | 이전 상태 → 다음 상태 | 조건 | 결과 |
|---|---|---|---|---|
| `list(tokenId, price, cid)` | NFT 소유자 | – → LISTED | 사전 `approve` 필요, `cid` 비어 있지 않음, 가격 규칙(4.2) 충족 | NFT가 에스크로로 이동 |
| `cancelListing(id)` | 판매자 | LISTED → CANCELLED | – | NFT 판매자 반환 |
| `buy(id)` | 판매자가 아닌 사용자 | LISTED → LOCKED | `msg.value == price` | `buyer`, `lockedAt` 기록 |
| `confirmReceipt(id)` | 구매자 | LOCKED → COMPLETED | 기한과 무관 | 정산 (5.1) |
| `claimAfterTimeout(id)` | 판매자 | LOCKED → COMPLETED | `block.timestamp ≥ deadline` | 정산 (5.1) |
| `refundBySeller(id)` | 판매자 | LOCKED → CANCELLED | 기한과 무관 | 구매자 환불액 적립, NFT 판매자 반환 (D4) |
| `openDispute(id)` | 구매자 | LOCKED → DISPUTED | `block.timestamp < deadline` | 자동 정산 보류 (D5) |
| `resolveDispute(id, true)` | `ARBITER_ROLE` | DISPUTED → CANCELLED | – | 구매자 환불액 적립, NFT 판매자 반환 (D5) |
| `resolveDispute(id, false)` | `ARBITER_ROLE` | DISPUTED → COMPLETED | – | 정산 (5.1) (D5) |
| `withdraw()` | 누구나 | 상태 변화 없음 | `pendingWithdrawals[msg.sender] > 0` | 출금 (5.1) |

기한 경계 규칙:
- 분쟁 제기는 `now < deadline`, 자동 정산 청구는 `now ≥ deadline`에서만 가능하다. 두 동작이 동시에 가능한 시점은 없다.
- DISPUTED 상태에서는 기한이 지나도 `claimAfterTimeout`을 호출할 수 없다 (상태 조건 불일치).
- 구매자는 기한이 지난 후에도 판매자가 정산을 청구하기 전이라면 `confirmReceipt`를 호출할 수 있다. 결과는 자동 정산과 같다.
- 판매자는 LOCKED 상태라면 기한과 관계없이 `refundBySeller`를 호출할 수 있다.
- 블록 타임스탬프는 수 초 단위로 오차가 있을 수 있으나, 기한(시연 시 수 분, 실제 수 일)에 비해 무시할 수 있는 수준이다.

중복 방지:
- NFT가 판매 등록 중에는 에스크로가 소유하므로 같은 NFT를 여러 거래에 동시에 등록할 수 없다.
- 모든 정산·환불은 상태를 먼저 변경한 뒤 수행하므로 같은 거래를 두 번 정산할 수 없다.
- 상태를 변경하는 모든 함수에 `nonReentrant`를 적용한다.

이벤트 (주요 식별자는 `indexed`):

| 이벤트 | 주요 필드 |
|---|---|
| `Listed` | listingId, tokenId, seller, price, conditionCID, isPrimary |
| `Purchased` | listingId, tokenId, buyer |
| `Completed` | listingId, tokenId, seller, buyer, price, royalty, conditionCID |
| `Cancelled` | listingId, tokenId, 사유(판매자 취소 / 판매자 환불 / 중재 환불) |
| `Disputed` | listingId, tokenId, buyer |
| `DisputeResolved` | listingId, refundBuyer |
| `Withdrawn` | account, amount |

### 4.4 조회용 함수 (최소 구성)

| 컨트랙트 | 함수 | 용도 |
|---|---|---|
| BSideEscrow | `listingCount()` | 전체 거래 수 |
| BSideEscrow | `getListings(offset, limit)` | 거래 정보를 묶음으로 조회 |
| BSideNFT | `totalMinted()` | 전체 토큰 수 |
| BSideNFT | `getTokens(offset, limit)` | 토큰 정보 + 소유자를 묶음으로 조회 |

- 판매 중 목록, 내 거래, 분쟁 목록, 토큰별 이력 같은 필터링은 컨트랙트가 아니라 서버의 `MarketReader`에서 수행한다 (6.1).
- 이전 설계의 EnumerableSet, 주소별·토큰별 배열, ERC721Enumerable은 MVP 데이터 규모에서는 불필요하다고 판단해 제외했다. 쓰기 가스와 컨트랙트 복잡도를 줄이기 위함이다.

## 5. 정산과 NFT 전송

### 5.1 Pull payment (출금 방식)

정산·환불 금액은 수령자에게 바로 송금하지 않고 `pendingWithdrawals`에 적립한다. 수령자는 `withdraw()`로 직접 출금한다.

| 거래 결과 | 적립 |
|---|---|
| COMPLETED | 판매자 `sellerAmount`, 아티스트 `royalty` (0이면 생략) |
| CANCELLED (LOCKED·DISPUTED에서) | 구매자 `price` 전액 |
| CANCELLED (LISTED에서) | 없음 (NFT만 반환) |

검증 조건:
- **중복 출금 방지**: 출금할 때 대기액을 먼저 0으로 바꾼 뒤 송금한다. 대기액이 0이면 revert한다.
- **재진입 방지**: `nonReentrant`를 적용하고 Checks-Effects-Interactions 순서를 지킨다.
- **출금 실패 처리**: 송금(`call`)이 실패하면 전체를 revert하므로 대기액이 그대로 남는다. 다시 시도할 수 있으며, 실패한 주소 외의 사용자에게는 영향이 없다. 출금은 `msg.sender` 본인에게만 가능하다.
- **자금 보존 불변식**: 항상 `address(this).balance ≥ Σ pendingWithdrawals + Σ(LOCKED·DISPUTED 거래의 price)`가 성립한다. 강제 송금(selfdestruct 등)으로 잔액이 늘어날 수 있어 등호가 아닌 `≥`로 정의한다.
- **관리자 출금 불가**: 관리자용 출금 함수를 두지 않는다. `receive`/`fallback`도 두지 않아 잘못 보낸 ETH는 거부된다.

### 5.2 NFT 전송 방식

| 방식 | 장점 | 위험 |
|---|---|---|
| `safeTransferFrom` | NFT를 처리할 수 없는 컨트랙트로 보내는 실수를 막음 | ① 구매자 컨트랙트가 수신을 거부하면 `confirmReceipt`·`claimAfterTimeout`·중재 정산이 모두 실패해 **판매자 대금이 영구히 묶임**(DoS) ② 외부 코드 호출로 재진입 통로가 생김 |
| `transferFrom` | 외부 코드를 호출하지 않음 | 구매자가 NFT를 처리할 수 없는 컨트랙트이면 NFT가 그 컨트랙트에 묶임. 피해는 구매자 본인에게 한정 |

결정: **모든 NFT 전송에 `transferFrom`을 사용한다.**
- 예치(판매자 → 에스크로), 이전(에스크로 → 구매자), 반환(에스크로 → 판매자) 모두 적용한다.
- 에스크로가 IERC721Receiver를 구현하지 않으므로, 누군가 `safeTransferFrom`으로 에스크로에 NFT를 직접 보내면 거부된다. 판매 등록 없이 에스크로에 묶이는 NFT가 생기지 않는다.

## 6. 데이터 조회와 흐름

### 6.1 조회 계층 (MarketReader)

```
페이지(Server Component) ──▶ getMarketReader() ──▶ MarketReader 인터페이스
                                                      ├─ chainReader   (MVP)
                                                      └─ postgresReader (향후)
```

- 화면 코드는 `MarketReader` 인터페이스와 `lib/data/types.ts`의 도메인 타입에만 의존한다.
- 구현체는 환경 변수 `DATA_SOURCE`로 선택한다. MVP는 `chain`만 구현한다.
- PostgreSQL 도입 시 이벤트를 DB에 적재하는 인덱서와 `postgresReader`를 추가하면 화면 코드를 수정하지 않아도 된다.

`chainReader` 조회 방식:

| 화면 | 방법 |
|---|---|
| 판매 중 목록 | `getListings`를 50건씩 읽고 `status == LISTED`로 필터 |
| 거래 상세 | `getListings`로 해당 거래 조회 + 토큰 정보 |
| 내 NFT | `getTokens`를 50건씩 읽고 `owner == 내 주소`로 필터 |
| 내 판매·구매 거래 | `getListings`에서 `seller` 또는 `buyer`로 필터 |
| 분쟁 목록 (관리자) | `getListings`에서 `status == DISPUTED`로 필터 |
| NFT별 거래 이력 | 해당 `tokenId` 이벤트 로그로 타임라인 구성 (블록 시각, 트랜잭션 해시) |

- 현재 상태는 항상 `getListings`의 `status`로 판단한다. 이벤트는 이력 표시에만 사용한다.
- 무료 RPC는 `eth_getLogs`로 한 번에 조회할 수 있는 블록 범위가 제한된다. 이벤트는 배포 블록부터 구간을 나누어 조회한다. 조회에 실패하면 Listing에 저장된 `listedAt`, `lockedAt`, `closedAt`으로 이력을 대신 표시한다.
- 전체를 훑는 방식은 거래 수에 비례해 느려진다. MVP 규모(수십~수백 건)에서는 충분하며, 규모가 커지면 PostgreSQL로 전환한다.

### 6.2 쓰기 흐름

1. 사용자가 브라우저에서 버튼을 누른다.
2. `lib/tx/`가 MetaMask 서명 요청을 보낸다. 판매 등록은 NFT `approve` 후 `list` 순서로 진행한다.
3. 트랜잭션이 블록에 포함되면 `router.refresh()`로 서버 조회 결과를 다시 불러온다.
4. 연결된 네트워크가 Sepolia(또는 개발 중 로컬 Hardhat 네트워크)가 아니면 전환을 요청한다.

### 6.3 IPFS 업로드 흐름 (Phase 2)

1. 브라우저에서 사진과 상태 정보를 `POST /api/ipfs`로 보낸다.
2. Route Handler가 파일 형식, 크기, 개수를 검증한다. 제한 값은 Phase 2 전에 결정한다.
3. 서버가 `PINATA_JWT`로 사진을 업로드하고, 사진 CID를 포함한 상태 기록 JSON을 업로드한다.
4. 상태 기록 JSON의 CID를 브라우저에 돌려주고, 브라우저는 이 CID로 `list`를 호출한다.

상태 기록 JSON (필수 항목은 Phase 2 전 확정):
```json
{
  "tokenId": 1,
  "seller": "0x...",
  "sealed": true,
  "condition": "사용 상태 설명",
  "defects": "하자 정보",
  "images": ["<사진 CID>"],
  "createdAt": "ISO 8601"
}
```

Phase 1 테스트용 CID:
- 컨트랙트는 빈 CID를 거부한다. Phase 1에서는 `lib/config/sampleCids.ts`에 정의한 샘플 CID를 사용한다.
- 화면에서는 샘플 CID에 "테스트용" 표시를 붙여 실제 상품 정보로 오인하지 않게 한다.
- Phase 2에서 실제 업로드로 바꿔도 컨트랙트는 수정하지 않는다.

## 7. 환경 변수와 비밀값

| 파일 | 변수 | 용도 | 노출 범위 |
|---|---|---|---|
| `.env.local` | `SEPOLIA_RPC_URL` | 서버 조회용 RPC | 서버 전용 |
| `.env.local` | `PINATA_JWT` | IPFS 업로드 | 서버 전용 |
| `.env.local` | `DATA_SOURCE` | 조회 구현체 선택 (`chain`) | 서버 전용 |
| `contracts/.env` | `DEPLOYER_PRIVATE_KEY`, `SEPOLIA_RPC_URL` | 컨트랙트 배포 | 로컬 전용 |

- `NEXT_PUBLIC_` 접두사가 붙은 변수만 브라우저 번들에 포함된다. 비밀값에는 붙이지 않는다.
- Pinata와 RPC를 다루는 모듈은 `import 'server-only'`로 클라이언트에서 가져올 수 없게 한다.
- `.env*` 파일은 `.gitignore`에 포함하고, 저장소에는 값 없는 `.env.example`만 커밋한다.
- 컨트랙트 주소와 ABI는 비밀값이 아니므로 `lib/contracts/`에 저장한다.

## 8. 보안 고려 사항과 알려진 한계

### 8.1 컨트랙트 보안 대책

| 위협 | 대책 |
|---|---|
| 재진입 공격 | `nonReentrant`, Checks-Effects-Interactions, pull payment, `transferFrom` 사용 |
| 무단 호출 | 함수별 호출자 검사 (판매자, 구매자, `ARTIST_ROLE`, `ARBITER_ROLE`) |
| 중복 판매 | NFT 에스크로 보관 |
| 중복 정산 | 상태 전이 선행, 종료 상태(COMPLETED, CANCELLED)에서 추가 전이 불가 |
| 송금 거부 DoS | pull payment, NFT `transferFrom` |
| 가격 변경 경쟁 | 등록 후 가격 수정 함수 없음 (취소 후 재등록), `msg.value == price` |
| 자기 거래 | `buy`에서 판매자 본인 구매 거부 |
| 정책 변경 | TokenInfo setter 없음 |

### 8.2 정책 우회 한계

- ERC-721 표준상 NFT는 플랫폼 밖에서 자유롭게 전송할 수 있다. 플랫폼 밖 거래로 가격 상한과 로열티를 피하는 것은 막을 수 없다. proposal.md 7장("외부 거래에 대해서는 로열티 지급이나 거래 이력 기록을 강제하지 않는다")에 따라 강제하지 않는다.
- 정가 보호형이라도 플랫폼 밖에서 추가 금액을 주고받는 것은 막을 수 없다.
- 아티스트가 다른 지갑으로 NFT를 옮겨 재판매로 등록하면 최초 판매가 고정 규칙을 피할 수 있다. 이 경우에도 재판매 정책(가격 상한)은 적용된다.
- 가격은 wei 단위로 고정되므로 법정화폐 기준 가치는 ETH 시세에 따라 변한다.
- NFT는 실물 상품의 정품 여부나 실제 상태를 보장하지 않는다. 상태 기록은 판매자가 등록한 내용이 등록 후 바뀌지 않았음만 보장한다.

### 8.3 관리자와 분쟁 중재의 한계

- 관리자는 배포자 지갑(EOA) 1개이므로 단일 장애점이다. 키가 유출되면 공격자가 임의로 아티스트 권한을 부여해 NFT를 발행할 수 있고, 진행 중인 분쟁 결과를 마음대로 정할 수 있다.
- 다만 관리자는 다음을 할 수 없다.
  - LISTED·LOCKED 상태의 자금이나 NFT 이동
  - 재판매 정책 변경
  - 임의 주소로 송금하거나 컨트랙트 잔액 출금
  - 분쟁에서 두 가지 결과 외의 처리
- 관리자가 분쟁을 처리하지 않으면 DISPUTED 상태가 무기한 유지되고 자금과 NFT가 묶인다. MVP에는 중재 기한이 없다.
- 중재 판단의 근거(사진, 대화 등)는 오프체인에 있으며 관리자 신뢰에 기반한다. 이의 신청 절차는 없다.
- 관리자가 다른 지갑으로 거래 당사자가 되는 이해 충돌은 기술적으로 막을 수 없다.
- 아티스트 권한을 회수해도 이미 발행된 NFT와 정책은 유지된다.
- 향후 개선 후보(미확정): 멀티시그 관리자, 타임락, 중재 기한.

## 9. 테스트 전략

컨트랙트 테스트 (`cd contracts && npx hardhat test`):
- **BSideNFT**: 아티스트 권한 검사, 정책별 bps 범위 검증, 빈 URI·0 가격 거부, 정책 불변, `setEscrow` 1회 제한, `primaryEnded` 판정(외부 전송, 에스크로 예치·반환, 거래 완료)
- **BSideEscrow 상태 전이**: 표 4.3의 모든 전이에 대해 허용 케이스와 거부 케이스(잘못된 호출자, 잘못된 상태)
- **기한 경계**: Hardhat 시간 조작으로 `deadline − 1`, `deadline`, `deadline + 1` 시점의 분쟁 제기와 자동 정산 검증
- **가격 규칙**: 최초 판매가 일치, 상한 경계값(정확히 상한, 상한 + 1 wei), 아티스트 재판매
- **정산**: 로열티 계산(소수점 버림), 판매자가 아티스트인 경우 로열티 0, 금액 합계 일치
- **Pull payment**: 중복 출금 거부, 재진입 공격 컨트랙트로 공격 시 실패, ETH 수신 거부 컨트랙트 출금 실패 시 대기액 유지, 각 시나리오 후 자금 보존 불변식
- **NFT 전송**: 수신 기능 없는 컨트랙트 구매자에게도 정산이 완료되는지, 에스크로로 `safeTransferFrom` 직접 전송 시 거부되는지

프론트엔드:
- `npm run lint`, `npm run build`
- 로컬 Hardhat 노드와 MetaMask 계정 3개(관리자·아티스트 / 판매자 / 구매자)로 흐름 A·B 수동 시연
- Sepolia 배포 후 같은 시나리오 반복

# B-SIDE

독립 아티스트의 굿즈 재판매와 창작자 수익 환원을 지원하는 NFT 기반 중고거래 플랫폼.

| 문서 | 내용 |
|---|---|
| [docs/proposal.md](docs/proposal.md) | 요구사항과 확정 정책 (D1~D13) |
| [docs/architecture.md](docs/architecture.md) | 시스템 구조, 컨트랙트 설계, 데이터 흐름 |
| [docs/progress.md](docs/progress.md) | 개발 단계와 진행 상황 |

- 회원가입·로그인은 없습니다. 상품 목록·상세·거래 이력은 지갑 없이 볼 수 있고, 발행·판매·구매 같은 거래 기능에서만 MetaMask 연결이 필요합니다.

## 로컬 개발 환경 실행

준비: Node.js 24, (거래 기능을 쓸 때) MetaMask. 명령은 PowerShell 기준입니다.

### 1. 처음 한 번

```powershell
npm install
cd contracts; npm install; cd ..
Copy-Item .env.example .env.local   # RPC_URL=http://127.0.0.1:8545, PINATA_JWT=<Pinata API 키의 JWT> 로 채운다
```

### 2. 실행할 때마다 (터미널 3개)

```powershell
# 터미널 1: 로컬 블록체인 노드 (끄면 모든 데이터가 초기화됨)
cd contracts; npm run node

# 터미널 2: 배포 + 테스트 NFT 발행 + 최초 판매 등록 (노드를 켤 때마다 1회)
cd contracts
$env:METADATA_URI = "ipfs://<Pinata 메타데이터 CID>"
$env:CONDITION_CID = "<Pinata 상품 상태 기록 CID>"
npm run setup:local

# 터미널 3: 웹 서버 → http://localhost:3000
npm run dev
```

- `setup:local` = `deploy:local`(배포·초기 설정·`lib/contracts/` 내보내기) + `seed:local`(발행 → 판매 등록).
- 배포 시 계정 #1이 활동명 "로컬 테스트 아티스트"로 승인됩니다. 바꾸려면 `ARTIST_ADDRESSES`와 `ARTIST_NAMES`(같은 개수, 쉼표 구분)를 함께 지정합니다.
- 기본 발행 값은 정가 보호형 120%, 최초 판매가 0.05 ETH입니다. 바꾸려면 `INITIAL_PRICE_ETH`, `POLICY`, `POLICY_BPS`를 함께 지정합니다.
- CID는 Pinata에 실제로 업로드한 값만 사용합니다 (가짜 CID 금지). 상태 기록 JSON의 `tokenId`·`seller`는 새 노드 기준 `1`·계정 #1(`0x7099…79C8`)입니다.
- 발행만 따로 하려면 `npm run mint:local`, 배포만 하려면 `npm run deploy:local`을 사용합니다.
- 재배포하면 `lib/contracts/deployment.json`의 `deployedAt`이 바뀝니다. 커밋 전에 확인하세요.

### 3. MetaMask (거래 기능을 쓸 때만)

- 네트워크 추가: RPC `http://127.0.0.1:8545`, chainId `31337`, 통화 기호 `ETH`.
- 계정 가져오기: `npm run node` 실행 시 출력되는 Hardhat 테스트 계정의 개인키를 사용합니다. 이 계정들은 공개된 테스트 전용 키이므로 실제 네트워크에서 절대 사용하지 마세요.
- 노드를 재시작하면 MetaMask의 활동·nonce 기록 초기화(설정 → 고급 → 활동 및 nonce 데이터 지우기)가 필요합니다. 선택된 계정에만 적용되므로 테스트 계정마다 계정을 바꿔 가며 실행합니다.

### 4. 화면에서 거래 시연 (흐름 A·B)

`npm run deploy:local`만 실행하고(발행은 화면에서 함) MetaMask에 계정 #0~#3을 가져옵니다. 거래할 때마다 MetaMask에서 해당 계정으로 전환합니다.

| 단계 | 계정 | 화면 |
|---|---|---|
| (선택) 아티스트 등록·회수 | #0 관리자 | `/admin` |
| A. 발행 → 최초 판매 등록 | #1 아티스트 | `/mint` → 완료 후 "최초 판매 등록하기" (`/sell/<토큰 ID>`) |
| A. 구매 → 수령 승인 | #2 구매자 | `/listings/<거래 ID>` |
| A. 출금 | #1 아티스트 | `/my` |
| B. 재판매 등록 | #2 (A의 구매자) | `/my` → 보유 NFT "판매 등록" |
| B. 구매 → 수령 승인 (또는 5분 뒤 #2가 "정산 청구") | #3 구매자 | `/listings/<거래 ID>` |
| B. 출금 (판매 대금 / 로열티) | #2 / #1 | `/my` |

- 재판매 등록은 화면에서 개봉 여부·사용 상태·하자·사진(1~5장)을 입력하면 서버가 Pinata에 올립니다. 최초 판매는 입력 없이 서버가 "아티스트 최초 판매 상품" 기록을 만들고 사진은 발행 때의 대표 이미지를 씁니다. `.env.local`에 `PINATA_JWT`가 있어야 하며, MetaMask 요청은 업로드 확인 서명(가스비 없음) → NFT 사용 승인 → 판매 등록 순서로 최대 3번입니다.
- 발행도 화면에서 굿즈 이름·설명·대표 이미지(1장)를 입력하면 서버가 Pinata에 올립니다. MetaMask 요청은 업로드 확인 서명 → NFT 발행 순서로 2번입니다. 로열티 정산을 보려면 창작자 상생형으로 발행합니다.
- `setup:local`·`mint:local` 스크립트는 지금처럼 Pinata에 직접 올린 CID를 환경 변수로 받습니다.
- 올린 사진과 상태 기록은 공개 IPFS에 남습니다. 개인정보가 찍힌 사진을 올리지 마세요.
- 로컬 수령 승인 기한은 300초입니다. 판매 등록 취소는 구매 전(판매 중)에만 할 수 있습니다.

## 문제 해결

개발 모드(`npm run dev`)에서는 조회 실패 시 오류 화면에 원인이 표시됩니다. RPC 주소나 키 같은 민감한 값은 표시하지 않으며, 원본 오류는 웹 서버 터미널 로그에서 확인합니다.

| 오류 화면 문구 | 조치 |
|---|---|
| RPC_URL 환경 변수가 설정되지 않았습니다 | `.env.local`에 `RPC_URL` 설정 후 새로고침 |
| RPC 노드에 연결할 수 없습니다 (ECONNREFUSED) | 터미널 1에서 `npm run node` 실행 |
| 배포 주소에 컨트랙트가 없습니다 | 노드 재시작 후 배포를 안 한 상태 → `npm run setup:local` |
| (거래 시) 트랜잭션 순번(nonce)이 맞지 않습니다 | 노드 재시작 후 MetaMask 기록이 남은 상태 → Hardhat Local 네트워크와 **해당 계정을 선택한 상태로** MetaMask 설정 → 고급 → 활동 및 nonce 데이터 지우기. 선택된 계정에만 적용되므로 테스트 계정마다 따로 실행 |

## 테스트

```powershell
cd contracts; npm test; npm run typecheck   # 컨트랙트
npm test                                    # 도메인 함수 단위 테스트·오류 문구 누락 확인 (루트, tests/)
npm run test:tx                             # 트랜잭션 오류 안내 문구 (로컬 노드를 포트 8546에 자동 실행, 먼저 contracts에서 npm run compile)
npm run lint; npm run build                 # 프론트엔드 (루트)
```

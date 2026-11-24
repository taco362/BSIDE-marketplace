# B-SIDE

독립 아티스트의 굿즈 재판매와 창작자 수익 환원을 지원하는 NFT 기반 중고거래 플랫폼.

| 문서 | 내용 |
|---|---|
| [docs/proposal.md](docs/proposal.md) | 요구사항과 확정 정책 (D1~D10) |
| [docs/architecture.md](docs/architecture.md) | 시스템 구조, 컨트랙트 설계, 데이터 흐름 |
| [docs/progress.md](docs/progress.md) | 개발 단계와 진행 상황 |

- 회원가입·로그인은 없습니다. 상품 목록·상세·거래 이력은 지갑 없이 볼 수 있고, 발행·판매·구매 같은 거래 기능에서만 MetaMask 연결이 필요합니다.

## 로컬 개발 환경 실행

준비: Node.js 24, (거래 기능을 쓸 때) MetaMask. 명령은 PowerShell 기준입니다.

### 1. 처음 한 번

```powershell
npm install
cd contracts; npm install; cd ..
Copy-Item .env.example .env.local   # RPC_URL=http://127.0.0.1:8545 으로 채운다
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
- 기본 발행 값은 정가 보호형 120%, 최초 판매가 0.05 ETH입니다. 바꾸려면 `INITIAL_PRICE_ETH`, `POLICY`, `POLICY_BPS`를 함께 지정합니다.
- CID는 Pinata에 실제로 업로드한 값만 사용합니다 (가짜 CID 금지). 상태 기록 JSON의 `tokenId`·`seller`는 새 노드 기준 `1`·계정 #1(`0x7099…79C8`)입니다.
- 발행만 따로 하려면 `npm run mint:local`, 배포만 하려면 `npm run deploy:local`을 사용합니다.
- 재배포하면 `lib/contracts/deployment.json`의 `deployedAt`이 바뀝니다. 커밋 전에 확인하세요.

### 3. MetaMask (거래 기능을 쓸 때만)

- 네트워크 추가: RPC `http://127.0.0.1:8545`, chainId `31337`, 통화 기호 `ETH`.
- 계정 가져오기: `npm run node` 실행 시 출력되는 Hardhat 테스트 계정의 개인키를 사용합니다. 이 계정들은 공개된 테스트 전용 키이므로 실제 네트워크에서 절대 사용하지 마세요.
- 노드를 재시작하면 MetaMask의 계정 활동 기록 초기화(설정 → 고급 → 활동 탭 데이터 지우기)가 필요할 수 있습니다.

## 문제 해결

개발 모드(`npm run dev`)에서는 조회 실패 시 오류 화면에 원인이 표시됩니다. RPC 주소나 키 같은 민감한 값은 표시하지 않으며, 원본 오류는 웹 서버 터미널 로그에서 확인합니다.

| 오류 화면 문구 | 조치 |
|---|---|
| RPC_URL 환경 변수가 설정되지 않았습니다 | `.env.local`에 `RPC_URL` 설정 후 새로고침 |
| RPC 노드에 연결할 수 없습니다 (ECONNREFUSED) | 터미널 1에서 `npm run node` 실행 |
| 배포 주소에 컨트랙트가 없습니다 | 노드 재시작 후 배포를 안 한 상태 → `npm run setup:local` |

## 테스트

```powershell
cd contracts; npm test; npm run typecheck   # 컨트랙트
npm run lint; npm run build                 # 프론트엔드 (루트)
```

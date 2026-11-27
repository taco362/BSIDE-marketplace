# B-SIDE — 개발 진행 상황

> 이 문서는 개발 단계와 진행 상황을 기록한다.
> 기능 범위(Phase 구분)는 [proposal.md](proposal.md) 6장, 설계 세부 사항은 [architecture.md](architecture.md)를 따른다.
> 각 단계가 끝나면 체크 표시, 테스트 결과, 미완성 사항을 이 문서에 갱신한다.

## 현재 상태

- **단계**: Phase 1 완료 (7단계 Sepolia 배포·시연 확인, 2026-11-27). Phase 2 업로드 U1~U4 완료
- **다음 작업**: Phase 2 나머지(판매자 환불·분쟁 제기 화면, 관리자 분쟁 중재 화면, 예외 상황 테스트) — 사용자 확인 후 시작
- **시연 주소**: https://bside-marketplace.vercel.app (Sepolia)
- **저장소 상태**: `contracts/` Hardhat 3 프로젝트 (컨트랙트 2종, 배포·발행 스크립트) + `lib/contracts/` (ABI, 로컬 배포 정보) + 프론트 조회 화면 (목록, 거래 상세, 토큰 이력)과 지갑 연결 + 거래 화면 (관리자, 발행, 판매 등록, 구매·수령 승인·정산 청구·등록 취소, 내 거래·출금)

## 진행 원칙

- 한 번에 한 단계씩 진행하고, 단계가 끝날 때마다 변경 파일과 테스트 결과를 보고한 뒤 승인을 받아 다음 단계로 넘어간다.
- 테스트 실패나 미완성 기능은 "비고"에 그대로 기록한다.

## Phase 1 — 핵심 거래 MVP

| 단계 | 작업 | 완료 기준 | 상태 |
|---|---|---|---|
| 1 | 개발 환경 구성: `contracts/` Hardhat 프로젝트, OpenZeppelin 설치, `.gitignore`·`.env.example` 정리 | Hardhat 샘플 컴파일 성공, 비밀값 파일이 git에서 제외됨 | ☑ 완료 |
| 2 | BSideNFT 구현 및 테스트 | architecture.md 9장의 BSideNFT 테스트 통과 | ☑ 완료 |
| 3 | BSideEscrow 전체 상태 머신 구현 및 테스트 (등록·취소·구매·승인·기한 정산·판매자 환불·분쟁·중재·출금) | architecture.md 9장의 Escrow·정산·보안 테스트 통과 | ☑ 완료 |
| 4 | 배포 스크립트: 명령 한 번으로 NFT·에스크로 배포 → `setEscrow` → 아티스트 등록 → ABI·주소·배포 블록을 `lib/contracts/`로 내보내기 (에스크로 주소는 1회만 등록되므로 재배포는 이 스크립트로 전체를 다시 생성). NFT 발행은 별도 스크립트로 분리 | 로컬 노드에서 스크립트 1회 실행으로 배포·초기 설정 성공 | ☑ 완료 |
| 5 | 프론트 기반: 지갑 연결, `MarketReader`·chainReader, 목록·상세·토큰 이력 페이지 | `npm run lint`, `npm run build` 통과, 로컬 노드 데이터 조회 확인 | ☑ 완료 |
| 6 | 거래 화면: 관리자 아티스트 등록·회수, 발행, 판매 등록·등록 취소, 구매·수령 승인·기한 경과 정산 청구, 출금 (Pinata에 수동 업로드한 실제 CID 사용) | 로컬 노드에서 흐름 A·B 수동 시연 성공 | ☑ 완료 |
| 7 | Sepolia 배포 및 시연 점검 (짧은 `confirmPeriod`) | Sepolia에서 흐름 A·B 시연 성공 | ☑ 완료 |

### 1단계 결과 (2026-11-22)

- 구성: Hardhat 3.22.0, `@nomicfoundation/hardhat-toolbox-mocha-ethers` 4.0.0, ethers 6, OpenZeppelin Contracts 5.6.1, solc 0.8.28 (evm: cancun), Node.js 24.12.0
- 비밀값: Sepolia RPC·개인키는 Hardhat keystore + `configVariable`로 관리 (architecture.md 7장). 루트 `.env.example` 추가, `.gitignore`에 `!.env.example` 예외 추가
- 루트 Next.js 설정 분리: `tsconfig.json` exclude와 ESLint ignore에 `contracts` 추가
- 검증
  - 임시 ERC721 컨트랙트 컴파일 및 로컬 네트워크 배포 테스트 1건 통과 (검증 후 임시 파일 삭제)
  - 루트 `npm run lint`, `npm run build` 통과
  - `git check-ignore`로 `.env.local`, `contracts/.env`, `contracts/node_modules`, `contracts/artifacts` 제외 및 `.env.example` 포함 확인
- 비고
  - `npm audit`: 개발 도구의 하위 의존성(`zod`, `glob`, `minimatch`)에서 취약점 16건(high 13, moderate 3) 보고. 배포되는 웹·컨트랙트 코드에는 포함되지 않으며, `npm audit fix --force`는 호환되지 않는 버전 변경 위험이 있어 적용하지 않음. 상위 패키지 업데이트 시 재확인
  - Hardhat 3에서 `network.connect()`는 deprecated 경고가 출력됨 → 테스트에서는 `network.getOrCreate()` 사용 예정

### 2단계 결과 (2026-11-22)

- 구현: `contracts/contracts/BSideNFT.sol` (ERC721URIStorage + AccessControl). 세부 사항은 architecture.md 4.1
- 테스트: `contracts/test/BSideNFT.ts` — **45개 통과, 실패 0** (`npm run typecheck` 통과)
  - 배포와 권한 6, 발행 3, 정책 수치 범위 경계값 11, 정책 불변 2, 에스크로 등록 4, 에스크로 직접 전송 차단 5, 최초 판매 자격 판정(D9) 11, 조회 3
  - 에스크로 동작은 3단계 전이므로 테스트에서는 일반 계정을 에스크로 주소로 등록하고, 실제 `list()`와 같은 방식(approve 후 에스크로가 transferFrom)으로 예치·반환·이전을 재현함
- 검증 보강: TokenInfo 기록을 `_mint` 뒤로 옮긴 변형 코드로 테스트를 돌려 4개가 실패하는 것을 확인 (순서 버그를 테스트가 검출함). 확인 후 원본 복구
- 2단계 검토 후 보완 (사용자 승인)
  - 에스크로 직접 전송 차단(`DirectTransferToEscrow`) 추가: `transferFrom`으로 에스크로에 바로 보내면 NFT가 영구히 묶이는 문제 수정. architecture.md 5.2의 잘못된 설명도 수정
  - 용어 정리: "최초 판매 종료" → "최초 판매 자격 종료". 플랫폼 최초 판매 완료와 구분 (proposal.md D9, architecture.md 4.1). 정책 내용은 변경 없음
  - 에스크로 1회 등록은 유지하고, 재배포는 4단계 배포 스크립트로 자동화하기로 함
  - 테스트 보강: 대리인 전송, `safeTransferFrom`, 재판매자 예치·반환, 직접 전송 차단
  - `contracts/package.json`에 `typecheck` 스크립트 추가 (typechain 타입 생성 후 `tsc` 실행)
- 비고: 실제 BSideEscrow와 연동한 최초 판매 자격 판정은 3단계 통합 테스트에서 다시 확인

### 3단계 결과 (2026-11-22)

- 구현: `contracts/contracts/BSideEscrow.sol` (ReentrancyGuard + AccessControl). 상태 전이·정산·출금 전체. 세부 사항은 architecture.md 4.2 ~ 4.4
- 테스트 전용: `contracts/contracts/test/MockBuyer.sol` (재진입 공격 / ETH 수신 거부 / NFT 수신 기능 없는 구매자 재현). 배포 대상 아님
- 테스트: `contracts/test/BSideEscrow.ts` — **61개 통과**, 전체 **106개 통과, 실패 0** (`npm run typecheck` 통과)

| 분류 | 개수 | 주요 확인 내용 |
|---|---|---|
| 배포 | 3 | 권한 부여, 잘못된 인자 거부, ETH 직접 송금 거부 |
| 최초 판매 등록 | 3 | 최초 판매가 고정(D1), 외부 이전 후 재판매 처리(D9) |
| 재판매 가격 규칙 | 5 | 상한 경계값(정확히 상한 허용, +1 wei 거부), 아티스트 재판매 상한(D10), 가격 0 |
| 등록 거부 조건 | 6 | 비소유자, approve 없음, 빈 CID, 중복 등록, 미등록 에스크로, 직접 전송 |
| 등록 취소 | 4 | NFT 반환, 재등록, 권한, LOCKED 이후 불가 |
| 구매 | 5 | 금액 일치, 자기 구매 금지, 중복 구매 차단, 없는 거래 |
| 수령 승인과 정산 | 8 | 최초 판매 로열티 0, 로열티 비율·소수점 버림·합계 일치, 정책별 로열티, 중복 정산 차단 |
| 기한 경계 | 6 | deadline − 1 / 정각에서 분쟁·자동 정산이 겹치지 않음, 분쟁 중 자동 정산 불가 |
| 판매자 환불 | 3 | 전액 적립·NFT 반환, 기한 후 가능, 분쟁 중 불가 |
| 분쟁 | 7 | 구매자만 제기, 두 결과만 가능, 권한, 중복 처리 차단, 관리자 자금 이동 함수 없음 |
| 출금 | 4 | 중복 출금 차단, 재진입 차단, 수신 거부 시 대기액 보존·재시도 |
| NFT 전송 | 2 | NFT 수신 기능 없는 컨트랙트 구매자에게도 정산 완료 (DoS 없음) |
| 최초 판매 자격 통합 | 2 | 실제 에스크로의 취소·환불·중재·완료를 거친 자격 변화 (2단계 남은 이슈 해소) |
| 자금 보존 불변식 | 2 | 혼합 시나리오 각 단계에서 잔액 = 대기액 + 보관 대금, 강제 송금 시 ≥ |
| 조회 | 1 | `getListings` 범위 |

- 검증 보강: `withdraw`에서 `nonReentrant`를 제거하고 대기액 초기화를 송금 뒤로 옮긴 취약 변형으로 테스트를 돌려 재진입 테스트가 실패하는 것을 확인 (테스트가 실제 취약점을 검출함). 확인 후 원본 복구, 106개 재통과
- 비고
  - 재진입 방어는 `nonReentrant`와 CEI 순서(대기액 선 초기화) 두 겹이다. 둘 중 하나만 빠진 경우에는 남은 한 겹이 공격을 막으므로 재진입 테스트가 통과한다 (테스트는 "공격이 성공하지 않음"을 확인한다)
  - 테스트 작성 중 chai matcher `emit(...).and.changeEtherBalances(...)` 체이닝이 Hardhat 3에서 트랜잭션 오류를 일으켜, 같은 트랜잭션에 대해 두 검사를 분리하는 방식으로 수정함

### 4단계 결과 (2026-11-23)

- 구현: `contracts/scripts/deploy.ts`, `contracts/scripts/mint.ts`, `contracts/package.json`에 `node`·`deploy:local`·`mint:local` 스크립트 추가. 세부 사항은 architecture.md 4.5
- 생성물: `lib/contracts/deployment.json`, `lib/contracts/abi/BSideNFT.json`, `lib/contracts/abi/BSideEscrow.json` (새 로컬 노드 1회 배포 결과)
- 범위 조정 (사용자 결정): 배포와 NFT 발행을 분리하고, 샘플 CID 기록 파일·임시 CID 관리 로직은 만들지 않음. 실제 NFT 발행은 Pinata에 메타데이터를 업로드한 뒤 진행. 가짜 CID로 발행하지 않음 (architecture.md 6.4, proposal.md FR-03 수정)
- 검증 (로컬 노드)
  - 배포 후 내보낸 ABI·주소만으로 노드를 직접 조회: NFT↔에스크로 상호 등록, `confirmPeriod` 300초, 관리자 `DEFAULT_ADMIN_ROLE`·`ARBITER_ROLE`, 아티스트(계정 #1) `ARTIST_ROLE`, 발행 0·거래 0 — 모두 확인
  - 같은 노드에 재배포 시 새 주소로 정상 배포·덮어쓰기 확인
  - 입력 검증: 잘못된 `CONFIRM_PERIOD_SECONDS`, 잘못된 `ARTIST_ADDRESSES`, `METADATA_URI` 누락, `ipfs://` 형식 아님, 잘못된 `POLICY` → 모두 안내 메시지와 함께 중단
  - 컨트랙트 테스트 106개, `npm run typecheck`, 루트 `npm run lint`·`npm run build` 통과
- 미검증 (숨기지 않음)
  - `mint.ts`의 실제 발행 경로: 가짜 CID 발행 금지 방침에 따라 실행하지 않음. Pinata 업로드 후 첫 발행 시 확인 필요
  - 로컬이 아닌 네트워크(Sepolia) 배포 경로: 7단계에서 확인 (`CONFIRM_PERIOD_SECONDS` 필수 검사 포함)
- 비고 (Windows 환경)
  - 백그라운드로 실행한 `npx hardhat node`를 종료해도 실제 노드 프로세스(`node ... hardhat ... node`)가 남아 8545 포트를 계속 점유하는 경우가 있었음. 이 때문에 다음 노드 실행이 포트 충돌로 실패하고 배포가 이전 노드로 들어감 → 해당 프로세스를 직접 종료한 뒤 새 노드에 다시 배포함. 터미널에서 직접 실행할 때는 `Ctrl+C`로 종료하면 된다

### 5단계 결과 (2026-11-24)

- 의존성: 루트에 `ethers` 6.17, `server-only` 추가
- 구현 (세부 사항은 architecture.md 3장, 6.1, 6.5)
  - 주소·ABI: `lib/contracts/index.ts` (`getNftContract`, `getEscrowContract`, `DEPLOYMENT`)
  - 도메인: `lib/domain/types.ts`, `policy.ts` (정책 표시, 재판매 상한 안내, 최초 판매 표시 상태), `format.ts` (wei→ETH, 주소 축약, 시각, 상태 이름), `lib/config/ipfs.ts`
  - 조회: `lib/data/reader.ts` (`MarketReader`), `lib/data/chain/provider.ts`, `chainReader.ts` (현재 상태 조회), `events.ts` (이벤트 이력), `mappers.ts` (반환값 변환), `lib/data/index.ts`
  - 지갑: `lib/wallet/signer.ts` (EIP-1193 계정·네트워크), `hooks/useWallet.ts`, `components/wallet/ConnectButton.tsx`
  - 화면: `/` 판매 중 목록, `/listings/[id]` 거래 상세(조회 전용, 거래 버튼은 6단계), `/tokens/[tokenId]` NFT 정보·플랫폼 거래·거래 이력, `error.tsx`, `not-found.tsx`
- 설계 변경 (architecture.md 반영): 지갑 상태를 `WalletProvider` context 대신 모듈 단위 저장소 + `useSyncExternalStore`로 관리 (6.5). `ListingCard`는 목록 화면에서만 쓰므로 `app/_components/`에 둠 (3.1 규칙)
- CLAUDE.md 규칙 11(파일 하나는 한 역할) 반영: `chainReader.ts`를 조회 / 이벤트 이력 / 변환 3개 파일로 분리, 상세·토큰 페이지의 정보 블록·표를 `_components/ListingInfo`, `TokenListingsTable`로 분리
- 검증
  - `npm run lint`, `npm run build` 통과 (RPC 없이 빌드됨. 조회 부분은 Partial Prerender로 요청 시 스트리밍)
  - 로컬 노드 연결 (빈 상태): `/` "판매 중인 상품이 없습니다", `/listings/1`·`/tokens/1`·`/listings/abc`·`/tokens/0` → 찾을 수 없음 표시
  - 노드 중단 시: 서버 로그에 `ECONNREFUSED`, 응답은 클라이언트 오류 경계(`error.tsx`)로 전환되는 표시 포함
  - 비밀값 노출 점검: `.next/static`에서 `RPC_URL`, `127.0.0.1:8545`, `PINATA` 검색 결과 없음
  - 데이터 조회 (새 로컬 노드, 사용자가 Pinata에 업로드한 실제 CID 사용)
    - 사전 점검: 메타데이터 CID `bafkreiac64jw…cnj4`, 상태 기록 CID `bafkreiftxfwf…3arm` 모두 공개 게이트웨이에서 조회됨. 상태 기록의 `tokenId: 1`, `seller`(계정 #1)가 시나리오와 일치
    - 발행: `npm run mint:local` (정가 보호형 120%, 최초 판매가 0.05 ETH — 시연용으로 정한 값) → tokenId 1. **4단계에서 미검증이던 `mint.ts` 발행 경로 확인**
    - 판매 등록·구매·수령 승인은 scratchpad의 임시 스크립트로 실행 (노드의 잠금 해제 계정 사용, 저장소에 포함하지 않음)
    - 단계별 화면 확인 (HTML 문구 검사, 실패 0건)
      - LISTED: 목록 카드(토큰 #1, 0.05 ETH, 정가 보호형 120%, 최초 판매), 상세(판매 중, 최초 판매가 고정, 상태 기록 CID, 메타데이터 URI, 재판매 상한 0.06 ETH), 토큰(최초 판매 자격 있음, 판매 등록 이벤트와 tx 해시)
      - LOCKED: 목록 비어 있음, 상세(구매 완료 · 수령 대기, 구매자 계정 #2, 구매 시각, 수령 승인 기한), 토큰(구매 이벤트)
      - COMPLETED: 상세(거래 완료, 종료 시각), 토큰(플랫폼 최초 판매 완료, 현재 소유자 = 구매자, 판매 등록 → 구매 → 거래 완료 이력, 대체 이력 안내 없음 = 이벤트 로그 사용)
  - 검증 후 노드·서버 종료, `deployment.json`은 원래 내용으로 복구 (재배포로 `deployedAt`만 바뀌었음)
- 미검증 (숨기지 않음)
  - MetaMask 연결·네트워크 전환은 브라우저 수동 확인 필요 (자동 테스트 없음)
  - 재판매·로열티·취소·분쟁이 포함된 이력 표시: 해당 상태 기록 CID가 추가로 필요하므로 6단계 흐름 B 시연에서 확인
  - 이벤트 로그 대체 경로(`eventsFromListings`)는 실제로 로그 조회가 실패하는 환경에서 확인하지 못함
  - 오류 화면(`error.tsx`)의 실제 표시는 브라우저에서 확인 필요 (HTML에서는 전환 표시만 확인)

### 5단계 보완 (2026-11-24, 브라우저 점검 후 사용자 승인)

- 브라우저 점검에서 판매 목록이 안 보인 원인: 실행 중인 dev 서버에 `.env.local`(RPC_URL)이 없었고 로컬 노드가 꺼져 있었음 (코드 결함 아님). `.env.local` 생성 후 목록·상세·이력·페이지 이동 정상, 콘솔 오류 없음
- 반영 내용
  - 로컬 실행 간소화: `contracts/scripts/seed.ts`(발행 + 최초 판매 등록), `npm run seed:local`, `npm run setup:local`(배포 + seed). 입력 확인·배포 정보 읽기를 `scripts/lib/`로 분리해 `mint.ts`와 공유. README를 로컬 실행 순서·문제 해결 중심으로 재작성
  - 현재 소유자가 에스크로이면 "에스크로 보관 중"으로 표시 (`Token.inEscrow`)
  - 개발 모드 오류 원인 표시: 조회 오류를 민감 정보 없는 안내 문구(`ChainReadError`)로 바꿔 전달, `error.tsx`는 개발 모드에서만 원인 표시
  - 지갑 선택 사항화: 헤더 `ConnectButton`이 연결을 강요하지 않도록 변경. 회원가입·로그인 없음, 조회는 지갑 불필요 원칙을 proposal.md 3장·architecture.md 6.5에 명시. 거래 기능의 연결 요구는 6단계 `NetworkGuard`에서 구현
- 검증
  - 루트 `npm run lint`, `npm run build` 통과, `contracts` `npm run typecheck` 통과 (컨트랙트 코드 변경 없음)
  - 브라우저(개발 모드) 오류 표시: 노드 중단 → "RPC 노드에 연결할 수 없습니다 (ECONNREFUSED)…", 배포 전 노드 → "배포 주소에 컨트랙트가 없습니다…". 브라우저 콘솔에 RPC 주소(`127.0.0.1:8545`)가 나타나지 않음 확인
  - `mint.ts` 리팩터링 후: `INITIAL_PRICE_ETH` 누락·잘못된 `POLICY` 거부, 정상 발행 확인
  - `seed.ts`: `CONDITION_CID`에 `ipfs://`를 붙이면 거부, 새 노드에서 `npm run setup:local` 1회로 배포·발행·판매 등록 완료 → 브라우저에서 목록·상세("에스크로 보관 중")·토큰 이력 확인
  - `.next/static`에서 `RPC_URL`, `127.0.0.1:8545`, `PINATA_JWT` 검색 결과 없음
- 미검증 (숨기지 않음)
  - "RPC_URL 미설정" 문구의 새 표시 경로: Provider가 서버 프로세스당 한 번 만들어지므로 실행 중인 dev 서버에서는 재현되지 않음. 같은 문구는 보완 전 점검에서 브라우저에 표시되는 것을 확인함
  - 프로덕션 모드에서 오류 화면의 `digest` 표시는 브라우저로 확인하지 않음
  - MetaMask 네트워크 전환 버튼 클릭 (MetaMask 승인 창은 사용자가 처리해야 함)

### 아티스트 활동명 표시 (2026-11-24, 사용자 결정: B안·권장안)

- 정책: proposal.md D7 확장 — 관리자가 지갑 주소와 활동명을 함께 등록(활동명 변경 가능), 회수 시 인증 표시만 제거
- 컨트랙트 (BSideNFT만 수정, BSideEscrow·정책·TokenInfo 변경 없음): `artistName` 매핑, `registerArtist(addr, name)`, `ArtistRegistered` 이벤트, `EmptyArtistName`·`ArtistNameTooLong` 오류, `MAX_ARTIST_NAME_BYTES = 64`. `grantRole` 경로는 막지 않고 화면·스크립트에서 쓰지 않음 (architecture.md 4.1)
- 배포 스크립트: `ARTIST_NAMES` 추가, `registerArtist`로 등록. 로컬 기본 활동명 "로컬 테스트 아티스트"
- 화면: `AccountLabel`로 아티스트·판매자·구매자·소유자·이력 당사자를 같은 규칙으로 표시 (활동명 + ✓ 인증 / 축약 주소, 상세 화면은 전체 주소 + 복사 버튼). 목록 카드에 아티스트와 판매자를 나누어 표시. 사용하지 않게 된 `components/ui/Address.tsx` 삭제
- 재배포: BSideNFT 변경으로 두 컨트랙트를 함께 다시 배포 (로컬은 `setup:local`, 새 노드 기준 주소 동일). Sepolia는 배포 전이라 영향 없음
- 검증
  - 컨트랙트 테스트 **113개 통과** (기존 106 + 활동명 7). 정책 불변 테스트(상태 변경 함수 목록)가 새 함수를 검출해 목록에 `registerArtist`를 추가함. `npm run typecheck` 통과
  - 루트 `npm run lint`, `npm run build` 통과
  - 배포 스크립트: `ARTIST_NAMES` 개수 불일치 시 중단, 기본 배포 시 활동명 등록 확인
  - 브라우저: 목록 카드(아티스트 "로컬 테스트 아티스트 ✓", 판매자 "아티스트 본인"), 거래 상세(판매자 활동명 + 인증된 아티스트 + 전체 주소), 구매·수령 승인 후 토큰 페이지(일반 소유자 = 축약 주소 + 전체 주소, 이력 당사자 표시), 승인 회수 후 활동명 유지·인증 표시 제거 확인. 콘솔 오류 없음
- 미검증 (숨기지 않음)
  - 주소 복사 버튼: 자동화 브라우저에서 클릭 후 "복사됨"으로 바뀌지 않음. 탭에 포커스가 없어 클립보드 접근이 막힌 것으로 추정되며, 실제 브라우저에서 직접 확인 필요
  - 일반 판매자(아티스트가 아닌 재판매자)의 목록 카드 표시: 재판매용 상태 기록 CID가 없어 6단계 흐름 B에서 확인

### 6단계 결과 (2026-11-25 구현·브라우저 검증, 2026-11-26 MetaMask 확인 완료)

- 범위 (사용자 결정): progress.md 목록 + 기한 경과 정산 청구(`claimAfterTimeout`), 판매 등록 취소(`cancelListing`, D4 LISTED), 아티스트 승인 회수 포함. 판매자 환불·분쟁 제기·중재 화면은 Phase 2 유지
- 구현 (세부 사항은 architecture.md 3장, 6.1, 6.2, 6.5)
  - 쓰기: `lib/tx/nft.ts`, `lib/tx/escrow.ts`, `lib/tx/errors.ts`(custom error → 한국어 안내), `lib/wallet/signer.ts`에 `getSigner()` 추가, `lib/contracts`에 `ARTIST_ROLE`
  - 훅·공용 컴포넌트: `hooks/useTx.ts`(단계 실행·진행 상태·`router.refresh()`), `hooks/useNow.ts`, `components/wallet/NetworkGuard`, `components/tx/TxStatus`·`TxButton`, `components/ui/FormField`
  - 입력 확인(안내용): `lib/domain/validation.ts`, `policy.ts`에 정책 수치 범위·`percentToBps`·판매 가격 규칙(`listingPriceRule`, `checkListingPrice`), `format.ts`에 `parseEth`
  - 조회: `MarketReader`에 `getTokensByOwner`, `getListingsByAccount`, `getPendingWithdrawal`, `getArtists`, `getAdmin` 추가. `chain/artists.ts`(ArtistRegistered 이벤트), 이벤트 구간 조회를 `chain/logs.ts`로 분리해 토큰 이력과 공유
  - 화면: `/admin`(등록·활동명 변경·회수), `/mint`, `/sell/[tokenId]`(approve → list), `/listings/[id]`에 `ListingActions`(구매·등록 취소·수령 승인·정산 청구), `/my`(출금, 보유 NFT → 판매 등록, 판매·구매 거래), 헤더 메뉴 `SiteNav`
- 설계 결정 (architecture.md 반영)
  - 컴포넌트는 `lib/tx` 함수를 `useTx`의 단계로 넘기기만 하고 Signer·Contract를 직접 만들지 않음 (3.1 의존 규칙 보완)
  - 판매 등록 경로를 `/sell/[tokenId]`로 정하고, NFT 선택은 `/my`의 보유 NFT 목록에서 함
  - `/my`는 연결 계정을 `?account=`로 서버에 전달해 조회 (서버는 지갑을 모름)
- 검증
  - 루트 `npm run lint`, `npm run build` 통과 (신규 라우트 `/admin`, `/mint`, `/my`, `/sell/[tokenId]` 포함)
  - `lib/tx` 실행 검증 (새 로컬 노드, scratchpad 임시 스크립트를 esbuild로 번들해 노드의 잠금 해제 계정으로 실행, 저장소에 포함하지 않음) — **13건 통과**
    - `registerArtist` 권한 부여·활동명 등록·재호출 시 활동명 변경, `revokeArtist` 후 권한 제거·활동명 유지
    - 오류 안내 문구: 비관리자 등록, 빈 활동명, 65바이트 활동명, 미승인 계정 발행(실제 발행 없음), 없는 거래의 `buy`·`cancelListing`·`claimAfterTimeout`, 출금액 0인 `withdraw`
  - 화면 렌더링 (dev 서버, HTML 문구 검사) — **12건 통과**: `/admin` 아티스트 목록(인증·회수 상태), `/mint`, `/my`(계정 없음·잘못된 주소·정상 주소의 출금 대기액 0 ETH·보유 NFT 없음), `/sell/1`·`/sell/abc` 찾을 수 없음, `/` 빈 목록. 서버 로그 오류 없음
  - 검증 후 노드·서버 종료, `deployment.json`은 원래 내용으로 복구
- 브라우저 흐름 A·B 검증 (2026-11-25, Chrome 자동화, 새 로컬 노드 + `deploy:local`)
  - 방식: MetaMask 승인 창은 자동화로 조작할 수 없으므로, 탭 안에만 **테스트용 EIP-1193 지갑 객체**를 주입해 요청을 로컬 노드의 잠금 해제 계정(#0~#3)으로 보냄. 화면 → `NetworkGuard` → `useTx` → `getSigner`(ethers `BrowserProvider`) → `lib/tx` → 컨트랙트 → `router.refresh()` 경로 전체를 실행. 확인 창(`window.confirm`)은 탭 안에서 자동 승인. 저장소 코드 변경 없음
  - CID: 사용자가 Pinata에 올린 메타데이터 `bafkreiac64jw…cnj4`, 상태 기록 `bafkreiftxfwf…3arm` (게이트웨이 조회 확인). 상태 기록 내용은 최초 판매용(tokenId 1, seller #1)이며, 흐름 B 재판매 등록에는 로컬 테스트에 한해 같은 CID를 재사용함
  - 관리자(#0): 아티스트 등록(#3 "검증 아티스트") → 목록 자동 갱신, 승인 회수 → "승인 회수됨 (활동명 기록은 유지)"
  - 흐름 A: 아티스트(#1) 발행 — 빈 입력·로열티 15% 범위 오류 안내 확인, 창작자 상생형 5%·0.05 ETH로 발행 → 영수증에서 토큰 #1 확인 → 최초 판매 등록(가격 고정 표시, `ipfs://` 접두어 거부, approve → list 2단계) → 판매자 등록 취소(NFT 아티스트 반환, 최초 판매 자격 유지) → `/my`에서 다시 등록 → 구매자(#2) 구매(LOCKED, 기한 표시, 판매자 화면은 기한 전 정산 청구 비활성) → 수령 승인(COMPLETED, NFT 구매자 이전) → 아티스트 출금(대기액 0.05 ETH → 0, 잔액 +0.04999 ETH = 가스비 차감)
  - 흐름 B: #2가 `/my` 보유 NFT에서 재판매 등록(0.08 ETH, 로열티 5% 안내) → 목록 카드 판매자 축약 주소 표시 → #3 구매 → 기한(300초) 경과 시 판매자 화면의 정산 청구 버튼이 자동 활성화 → 정산 청구(COMPLETED) → 판매자 대기액 0.076 ETH, 아티스트 로열티 0.004 ETH 각각 출금
  - 토큰 화면: "플랫폼 최초 판매 완료", 현재 소유자 #3("검증 아티스트", 회수되어 인증 표시 없음), 거래 4건 표와 이벤트 이력(등록·취소·구매·완료, 로열티 0.004 ETH) 표시. 브라우저 콘솔 오류 없음
  - **5단계에서 넘어온 미검증 항목 해소**: 재판매·로열티가 포함된 이력 표시, 일반 판매자의 목록 카드 표시
- 브라우저 검증에서 발견해 수정한 문제 (2건)
  - 판매 등록 완료 표시가 남는 문제: Cache Components는 방문한 화면을 `<Activity>`로 숨겨 상태를 보존한다. 등록 후 취소하고 `/sell/[tokenId]`로 돌아오면 이전 "판매 등록을 완료했습니다"가 남아 폼이 보이지 않았음 → 완료 표시를 NFT가 실제로 에스크로에 있을 때(`token.inEscrow`)만 보이도록 수정. 재검증 통과
  - 이전 동작의 결과 표시가 다음 버튼에 붙는 문제: 구매 후 같은 위치의 `TxButton`이 재사용되어 "수령 승인" 아래에 구매의 "완료되었습니다."가 표시됨 → `ListingActions`의 버튼 영역에 `key`(상태·계정)를 붙여 상태가 바뀌면 새로 그리도록 수정. 재검증 통과
  - 수정 후 `npm run lint`, `npm run build` 통과
- MetaMask 확인 (2026-11-26, 사용자 수동 확인, 계정 #0~#3을 MetaMask에 가져와 진행)
  - 사용자 보고: 관리자 등록·활동명 변경·회수, 흐름 A·B 전 과정 정상 동작
  - MetaMask 서명 창에서 거부 시 "서명이 거부되었습니다" 안내 확인 대상에 포함 (안내 순서 README 4절)
  - 참고: 앱의 "네트워크 전환" 버튼으로 전환을 승인할 때 MetaMask 오류 화면("Cannot read properties of undefined (reading 'origin')", TypeError)이 한 번 표시됨. 앱 코드에는 해당 문구·코드가 없고 앱은 표준 `wallet_switchEthereumChain` 요청만 보내므로 MetaMask 내부 오류로 판단. MetaMask에서 네트워크를 직접 선택하는 방법으로 우회. 재발하면 전환 안내 문구 보완 검토
- 미검증 (숨기지 않음)
  - 잔액 부족 문구는 실행하지 않음 (테스트 계정 잔액이 충분함)
  - 정산 청구 버튼의 활성화는 브라우저 시계 기준이다. 실제 판정은 블록 시각이므로 시계가 다르면(예: 로컬 노드 시간 조작) 버튼 표시와 컨트랙트 판정이 어긋날 수 있다. 어긋나면 컨트랙트가 `DeadlineNotReached`로 거부하고 안내 문구가 나온다

참고: 컨트랙트의 환불·분쟁·중재 기능은 배포 후 변경이 어렵기 때문에 Phase 1(3단계)에서 함께 구현한다. 해당 화면(UI)은 Phase 2에서 만든다.

### 7단계 결과 (2026-11-27 완료, 사용자 시연 확인)

- 결정 (사용자)
  - Sepolia `confirmPeriod` = 300초. 구매 시점 기준 기한은 MVP 단순화이며, 배송 완료 시점 기반 기한을 향후 개선 사항으로 기록 (proposal.md FR-05·6장). 상태 머신은 변경하지 않음
  - 관리자와 아티스트는 다른 계정. 아티스트는 배포 후 사용자가 관리자 화면에서 직접 등록 (배포 시 `ARTIST_ADDRESSES` 미지정)
  - 배포용 RPC: Alchemy (사용자 가입 예정)
- 준비: `npm run deploy:sepolia` 스크립트 추가
- 확인한 사항: Alchemy 무료 등급은 `eth_getLogs`를 10블록 단위로만 허용한다. 서버 조회(`RPC_URL`)에 쓰면 이벤트 조회가 사실상 불가능하다. 2026-11-27 시험 요청에서 공개 RPC `ethereum-sepolia-rpc.publicnode.com`은 10,000블록 조회에 응답했고, `1rpc.io`는 50블록 제한이었다. 사용자 결정: 배포는 Alchemy, 서버 조회(`RPC_URL`)는 publicnode
- keystore 등록 완료 (사용자, `SEPOLIA_RPC_URL`·`SEPOLIA_PRIVATE_KEY` 이름만 확인)
- 배포 완료 (2026-11-27, 사용자 터미널에서 `deploy:sepolia` 실행)
  - BSideNFT `0xAC415B2507a1112547Ce1D7bdb42786ef6AB93eF` (block 12221276), BSideEscrow `0xe6966F582D3e61656BBaF3C43607732181F58c60` (block 12221277), 관리자 `0x44C6dD3C9077290eEB4106600F9146630772fDf0`
  - publicnode로 직접 조회: 코드 크기 로컬 빌드와 동일, NFT↔에스크로 상호 등록, `confirmPeriod` 300, 관리자 `DEFAULT_ADMIN_ROLE`(양쪽)·`ARBITER_ROLE` 보유, 관리자에게 `ARTIST_ROLE` 없음 — 모두 확인
  - 첫 시도 2회 실패(Git Bash에서 PowerShell 문법 안내로 기한 값 누락, keystore 비밀번호 오입력). 둘 다 트랜잭션 전 중단되어 배포·가스 소모 없음
- 앱 전환: `.env.local` `RPC_URL` → publicnode (사용자 수정). 개발 서버에서 `/`·`/admin`·`/mint`·`/my`·`/tokens/1`·`/listings/1` 응답 확인 — 판매 목록 비어 있음, 관리자 화면에 배포 계정 표시·등록 아티스트 없음(이벤트 조회 오류 없음), 없는 토큰·거래는 "찾을 수 없습니다"
- Vercel 배포 (2026-11-27, 사용자): https://bside-marketplace.vercel.app (architecture.md 7.1)
  - 확인: `/`·`/admin`·`/mint`·`/my`·`/tokens/1`·`/listings/1` 모두 200. 관리자 화면에 사용자가 등록한 아티스트 `0xD440…EA76` 표시(publicnode 이벤트 조회 정상). 업로드 API에 서명 없이 요청하면 400 거부
- 흐름 A·B 시연 (2026-11-27, 사용자 수동 확인): Vercel 링크에서 Sepolia MetaMask 계정으로 진행, 사용자 보고로 완료
- 참고 (숨기지 않음)
  - 시연 세부 결과(트랜잭션 해시, 계정별 잔액 변화)는 이 문서에 기록하지 않았다. 사용자 보고만으로 완료 처리
  - 저장소의 `lib/contracts/deployment.json`은 Sepolia 값으로 유지해야 한다. 로컬 개발 시 `setup:local`이 덮어쓰므로 커밋하지 않는다 (architecture.md 7.1)
  - 공개 RPC(publicnode)는 Vercel 공유 IP 때문에 요청 제한에 걸릴 수 있다. 시연 전에 접속을 확인한다

## Phase 2 — 상품 정보 및 거래 안정성

7단계(Sepolia)보다 업로드 기능을 먼저 진행한다 (사용자 결정, 2026-11-26). 정책은 proposal.md D11~D13.

| 단계 | 작업 | 완료 기준 | 상태 |
|---|---|---|---|
| U1 | 업로드 기반: 지갑 메시지 서명 확인, Pinata 업로드(`lib/ipfs/pinata.ts`, server-only), 사진 업로드 Route Handler (형식·용량 검사, 권한 확인) | 서명·권한·형식·용량 거부 테스트 통과, 실제 Pinata 업로드 1건 확인 | ☑ 완료 |
| U2 | 상품 상태·사진 등록 화면: 판매 등록 화면에서 입력 → 서버가 상태 기록 JSON 작성·업로드 → `list` (수동 CID 입력 대체) | 로컬에서 흐름 B 재판매 등록 성공 | ☑ 완료 |
| U3 | 발행 메타데이터 업로드: 발행 화면에서 이름·설명·대표 이미지 입력 → 업로드 → `mint` (D13) | 로컬에서 흐름 A 발행 성공 | ☑ 완료 |
| U4 | 과거 상품 상태 조회: 거래 이력에 거래별 상태 기록 내용과 사진 표시 | 여러 번 거래된 NFT의 거래별 상태 표시 확인 | ☑ 완료 |
| 판매자 환불, 분쟁 제기 화면 | ☐ 대기 |
| 관리자 분쟁 중재 화면 | ☐ 대기 |
| 예외 상황 테스트 보강 | ☐ 대기 |

### U1 결과 (2026-11-26)

- 설계: architecture.md 6.3 (업로드 확인 서명 형식·유효 시간·권한, `POST /api/ipfs/images`, 모듈 구성)
- 구현: `lib/domain/upload.ts`(제한 값·서명 문장), `lib/ipfs/pinata.ts`(v3 Files API, `network=public`), `lib/upload/auth.ts`(서명·유효 시간·권한), `lib/upload/image.ts`(바이트 시그니처 판별·크기), `lib/upload/errors.ts`, `app/api/ipfs/images/route.ts`
- 문서: CLAUDE.md·README·architecture.md의 정책 범위 표기를 D1~D13으로 변경
- 검증 (로컬 노드 + dev 서버, scratchpad 임시 스크립트로 노드 계정이 서명해 요청. 저장소에 포함하지 않음)
  - `npm run lint`, `npm run build` 통과
  - 거부 12건 통과: 서명 없음(401), 잘못된 용도(400), 다른 지갑 서명으로 주소 위조(401), 서명한 NFT 번호와 요청 번호 불일치(401), 다른 체인용 서명(401), 만료 400초(401), 미래 120초(401), condition 소유자 아님(403), 없는 NFT(400), metadata 아티스트 아님(403), PNG로 위장한 텍스트(415), 4MB+1바이트(413)
  - 에스크로 보관 중인 NFT의 상태 기록 업로드 거부(403) 통과 (실제 상태 기록 CID로 판매 등록 후 확인)
  - 실제 Pinata 업로드: condition·metadata 용도 각각 200, 게이트웨이에서 원본과 같은 바이트 확인 (같은 사진은 같은 CID)
  - 비밀값 점검: `.env.local`의 `PINATA_JWT` 값이 `.next/static`, `.next/server`에서 검색되지 않음
- 비고 (숨기지 않음)
  - 테스트 중 "4MB 이하 정상 요청" 케이스가 의도와 달리 실제 업로드됨 (작업 도중 사용자가 `PINATA_JWT`를 저장해 설정 오류 대신 업로드까지 진행). 0으로 채운 약 3.7MB 테스트 파일 1개(CID `bafybeie66s2nyfifocm3ahc42ucyoudtkk4ueruiixudcb25qflmqbzzla`)가 사용자 Pinata 계정에 공개로 올라감
  - 테스트용 1×1 PNG(70바이트, CID `bafkreigectgq4icn5f2pon2ty7ri25ry46zwsg5ywgrlvnvslo375v6oo4`)도 업로드됨
  - 위 2개는 사용자 요청으로 Pinata v3 API로 삭제함 (2026-11-26, 삭제 후 CID 조회 결과 0건). 공개 IPFS 특성상 다른 노드·게이트웨이 캐시에 남아 있을 수 있음
  - 서명 유효 시간(5분) 안에서는 같은 서명을 재사용할 수 있다 (DB 없음, architecture.md 6.3 한계)
  - 실행 중이던 이전 로컬 노드에 재배포되어, 사용자가 MetaMask로 확인하던 거래 기록은 화면에서 보이지 않게 됨 (로컬 데이터, `deployment.json`은 원래 값으로 복구)
  - 브라우저 화면 연동(MetaMask 메시지 서명)은 U2에서 구현·확인

### U2 결과 (2026-11-26 완료, 사용자 MetaMask 화면 확인)

- 구현 (세부 사항은 architecture.md 6.3)
  - 서버: `POST /api/ipfs/condition`, `lib/upload/condition.ts`(입력 확인·기록 작성), `lib/ipfs/pinata.ts`에 `uploadJson`
  - 브라우저: `lib/api/upload.ts`(업로드 확인 서명·업로드 요청), `components/upload/PhotoPicker.tsx`, `app/sell/[tokenId]/_components/ConditionFields.tsx`
  - 판매 등록 화면: CID 입력 칸 제거 → 상태·사진 입력, `useTx` 단계로 서명 → 사진 업로드 → 상태 기록 업로드 → approve → list. 승인·등록 서명 거부 후 같은 입력으로 재시도하면 업로드를 건너뜀
  - 공통: `useTx` 단계 종류 `work`("처리 중" 표시), `lib/domain/errors.ts`의 `UserFacingError`(지갑·업로드 오류 공통), `lib/domain/upload.ts`에 상태 입력·사진 개수·파일 확인 함수
  - 정리: 쓰지 않게 된 `checkConditionCid` 삭제, README 시연 안내 갱신
- 검증 (새 로컬 노드 + dev 서버. 페이지가 쓰는 `lib/api/upload.ts`·`lib/tx/*`를 scratchpad 스크립트에서 그대로 호출, 노드 계정이 서명. 저장소에 포함하지 않음)
  - `npm run lint`, `npm run build` 통과
  - 상태 기록 API 거부 10건 통과: 서명 없음(401), 소유자 아님(403), metadata 용도 서명으로 요청(401), 개봉 여부 없음, 사용 상태 빈칸·1001자, 사진 0장·6장, CID 형식 오류, 중복 사진(모두 400)
  - 정상 흐름: 사진 업로드 → 상태 기록 업로드 → 게이트웨이 JSON 확인 8건(tokenId·seller는 서버 값, sealed, 앞뒤 공백 제거, 하자 빈칸 → "없음", images, createdAt, 원본 파일 이름 미포함) → approve → list 성공, 거래의 `conditionCID` = 업로드한 기록, 거래 상세 화면에 CID 표시
  - 최초 판매가 불일치 등록 시 "최초 판매는 최초 판매가(0.05 ETH)로만…" 안내 확인 (MetaMask를 거치지 않은 오류의 revert 해석)
- 사용자 화면 확인 (MetaMask): 구매 → 수령 승인 → 판매 등록 화면에서 상태·사진 입력 후 재판매 등록까지 정상 확인 (사용자 보고 "전부 제대로 확인됨")
- 비고 (숨기지 않음)
  - 이 세션에서는 브라우저 자동화를 쓸 수 없어 화면 조작은 사용자가 직접 확인함
  - 노드 재시작 후 MetaMask nonce 불일치는 MetaMask 쪽 조치(기본 화면 네트워크를 Hardhat Local로 선택 후 기록 지우기 또는 nonce 직접 지정)로 해결됨. 앱 코드 문제 아님
  - 테스트 업로드가 Pinata에 남음: 1×1 PNG `bafkreigectgq…oo4`, 상태 기록 JSON 2개 `bafkreibou6ps…pwky`(첫 실행, 스크립트 가격 오류로 등록 전 중단), `bafkreigxd63t…7hlwa`(로컬 거래 #1에 연결). 삭제 여부는 사용자 결정
  - 화면 확인 중 발견 (2026-11-26): 노드 재시작 후 구매 시 "could not coalesce error" 표시. 노드 로그상 원인은 MetaMask의 이전 nonce(`Nonce too high. Expected 0 but got 9`) — MetaMask의 기록 지우기는 선택된 계정에만 적용됨. 앱의 오류 안내가 MetaMask가 감싼 오류 안쪽을 보지 못해 nonce 안내 대신 원문이 나왔음 → `lib/tx/errors.ts`가 감싼 오류의 메시지까지 찾도록 수정(같은 구조의 오류로 확인), README 안내를 "계정마다 실행"으로 수정
  - dev 서버 로그에 브라우저 오류 1회(`UserFacingError is not defined`): 서버 재시작 전 열려 있던 탭의 이전 번들에서 발생한 것으로 판단. 현재 서버가 내려주는 코드에는 import와 정의가 모두 있고 이후 재발 없음. 화면 확인 때 다시 나오면 알려 주기 바람

### U3 결과 (2026-11-26 완료, 사용자 MetaMask 화면 확인)

- 구현 (세부 사항은 architecture.md 6.3)
  - 서버: `POST /api/ipfs/metadata`, `lib/upload/metadata.ts` (승인된 아티스트만, `{ name, description, image: "ipfs://…" }` 작성)
  - 브라우저: `lib/api/upload.ts`에 `uploadMetadata`, 발행 화면에서 메타데이터 URI 입력 → 굿즈 이름·설명·대표 이미지(`PhotoPicker` 1장) 입력으로 교체, `useTx` 단계로 서명 → 이미지 업로드 → 메타데이터 업로드 → mint
  - 정리: 쓰지 않게 된 `checkMetadataUri` 삭제, README 안내 갱신
- 검증 (로컬 노드 + dev 서버, 화면이 쓰는 `lib/api/upload.ts`·`lib/tx/nft.ts`를 scratchpad 스크립트에서 호출. 저장소에 포함하지 않음)
  - `npm run lint`, `npm run build` 통과
  - 거부 8건: 서명 없음(401), 아티스트 아님(403), condition 용도 서명으로 요청(401), 이름 빈칸·101자, 설명 없음, 이미지 없음·CID 형식 오류(400)
  - 정상 흐름 9건: 대표 이미지·메타데이터 업로드, JSON 키가 name·description·image뿐, 이름 앞뒤 공백 제거, image = `ipfs://<이미지 CID>`, mint 성공, `tokenURI` = `ipfs://<메타데이터 CID>`, 토큰 화면 표시
  - 첫 실행에서 거부 4건이 400 대신 500으로 응답: dev 서버가 수정된 `lib/domain/upload.ts`를 늦게 반영해 `checkMetadataInput`이 없는 이전 모듈을 쓴 것(서버 로그 `is not a function`). 코드 변경 없이 재실행 시 17건 모두 통과, 프로덕션 빌드 정상
- 사용자 화면 확인 (MetaMask): 발행 화면에서 이름·설명·이미지 입력 후 발행까지 정상 확인 (사용자 보고 "다 좋음")
- 비고 (숨기지 않음)
  - 테스트 업로드: 메타데이터 JSON `bafkreiblkjiq…mkwy` 1개 추가 (재실행은 같은 내용이라 같은 CID). 로컬 토큰 #2·#3에 연결

### 최초 판매 상태 기록 자동 작성 (2026-11-26 완료, 사용자 MetaMask 화면 확인)

- 배경: 사용자 제안 "최초 판매인데 사진·상태를 또 입력할 필요가 있는가" → 선택지 4개 중 "서버 자동 기록"으로 결정 (D11 변경, proposal.md FR-03·8장 표 반영)
- 구현 (세부 사항은 architecture.md 6.3)
  - 상태 기록에 `type` 추가: `resale`(기존 입력 기록) / `primary`(`condition` "아티스트 최초 판매 상품", `metadata` = tokenURI, `images` = 메타데이터 대표 이미지 CID)
  - 서버가 체인 정보로 최초 판매 여부 판단(`isPrimarySale`, `listingPriceRule`과 공용). 최초 판매면 요청의 상태·사진 값 무시. `verifyUploadAuth`가 확인한 NFT 정보를 돌려줌
  - `lib/ipfs/gateway.ts`: 메타데이터 JSON 읽기 (15초·64KB 제한, 실패 시 502)
  - 판매 등록 화면: 최초 판매는 입력 칸 대신 안내 문구, 서명 → 상태 기록 작성 → approve → list. 컨트랙트 변경 없음
- 검증 (로컬 노드 + dev 서버, scratchpad 스크립트. 저장소에 포함하지 않음)
  - `npx tsc --noEmit`, `npm run lint`, `npm run build` 통과
  - 11건 통과: 최초 판매 기록 6건(type, condition 문구, metadata = tokenURI, images = 대표 이미지, tokenId·seller 서버 값, sealed·defects 없음), 최초 판매에서 보낸 위조 입력 무시, 소유자 아님 403, list 후 거래 `isPrimary` = true·`conditionCID` 일치(거래 #4), 재판매(구매 후 #2 소유) 입력 없음 400, 재판매 기록 `type: "resale"`
- 비고 (숨기지 않음)
  - 첫 실행은 검증 스크립트 오류(조회 함수 인자)로 중간에 멈춤. 앱 코드 문제 아님, 스크립트 수정 후 재실행
  - 테스트 업로드가 Pinata에 추가됨: 상태 기록 JSON 5개 (최초 판매 기록 4개 — 두 번 실행 × 정상·위조 입력, 재판매 기록 `bafkreicw22qz…hlaa` 1개). 로컬 토큰 #2는 검증 중 거래 #4로 최초 판매 → #2 계정 소유가 됨
  - U2 이전에 올린 로컬 테스트 상태 기록에는 `type`이 없다 → 재판매 기록으로 읽는다 (U4에서 처리)
- 사용자 화면 확인: 최초 판매 화면에서 입력 없이 등록까지 정상 (처음에는 수정 전에 열린 탭이라 이전 화면 코드가 쓰여 입력 칸이 보였음 → 강력 새로고침 후 정상)

### U4 결과 (2026-11-26 완료, 사용자 화면 확인)

- 구현 (세부 사항은 architecture.md 6.6)
  - 토큰 이력(`/tokens/[id]`): "판매 등록" 항목마다 그 거래의 상태 기록(개봉 여부·사용 상태·하자·사진, 최초 판매는 "아티스트 최초 판매 상품"·대표 이미지·발행 정보 링크)과 작성 시각, 원본 기록 링크
  - 거래 상세(`/listings/[id]`): "상품 상태 기록" 섹션 추가 (기존 CID 한 줄 대체)
  - `lib/domain/conditionRecord.ts`(형식 확인·거래와 어긋남 경고), `lib/data/ipfs/conditionRecords.ts`(조회, 기록마다 `<Suspense>`), `components/condition/ConditionRecordView.tsx`
  - 보안 보완: `lib/ipfs/gateway.ts`가 CID만 요청하도록 변경. 직전 커밋의 최초 판매 기록 작성은 `tokenURI`(아티스트가 정하는 값)가 http 주소여도 서버가 요청했음 → `ipfs://<CID>`일 때만 읽도록 수정. `IpfsLink`는 http(s)가 아닌 값(`javascript:` 등)을 링크로 만들지 않음
- 검증 (로컬 노드 + dev 서버, scratchpad 스크립트. 저장소에 포함하지 않음)
  - `npx tsc --noEmit`, `npm run lint`, `npm run build` 통과
  - 형식 확인·경고·조회 17건 통과: type 없는 기록 → 재판매, 알 수 없는 type·sealed 없음·사진 CID 아님·사진 6장·주소 형식 오류·배열/null 거부, 경고(일치 0건, NFT·판매자 불일치 2건, 최초 판매 기록 + 재판매 거래 1건), URL 요청 거부, CID 아닌 값 → invalid, Phase 1 실제 기록 → ok, 사진 CID(JSON 아님) → invalid
  - 화면 응답 확인: 토큰 #1(2번 거래) 거래별 기록 2개·사진 표시, 토큰 #2·거래 #4 최초 판매 기록 표시, 거래 #1 상세 표시
  - 컨트랙트 직접 호출로 비정상 기록 등록 후 거래 상세 확인 4건 통과: `javascript:alert(1)` CID → 링크 없음·"형식을 읽을 수 없음"(거래 #6), 토큰 #1 기록 재사용 → NFT 번호 불일치 경고(거래 #7), 두 거래 취소 후 토큰 #3 최초 판매 자격 유지
- 비고 (숨기지 않음)
  - 로컬 토큰 #3 이력에 검증용 등록·취소 거래 #6·#7이 남음 (로컬 데이터)
  - 상태 기록은 페이지 요청마다 게이트웨이에서 다시 읽는다 (캐시 없음). 거래가 많은 토큰은 느릴 수 있으나 기록마다 따로 표시되어 나머지 화면은 먼저 보임
- 사용자 화면 확인: 토큰 이력·거래 상세의 상태 기록 표시 정상 (사용자 보고 "화면 괜찮음")

## Phase 3 — 확장 기능

| 작업 | 상태 |
|---|---|
| 구매자 추가 후원 | ☐ 대기 |
| 상품 검색 및 필터링 개선 (PostgreSQL 도입 검토) | ☐ 대기 |
| 거래 이력 시각화 | ☐ 대기 |
| NFC 기반 실물 식별 기능 검토 | ☐ 대기 |

## 결정이 필요한 항목

목록은 [proposal.md](proposal.md) 8장 "남은 미결정 사항"에서 관리한다. 해당 시점이 되면 사용자에게 질문한 뒤 진행한다.

## 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-11-22 | 요구사항 분석 및 미결정 사항 결정 (D1~D8) |
| 2026-11-22 | 설계 재검토: 최초 판매 판정(D9), 아티스트 재판매(D10) 확정. 기한 경계, NFT 전송 방식(`transferFrom`), pull payment 검증 조건, 테스트용 CID, 조회 인덱스 최소화, 관리자 한계 반영 |
| 2026-11-22 | 문서 정리: proposal.md 갱신, architecture.md·progress.md 작성, CLAUDE.md 문서 참조 규칙 추가 |
| 2026-11-22 | Phase 1 · 1단계 완료: Hardhat 3 프로젝트 구성, 비밀값 관리 방식을 `contracts/.env`에서 Hardhat keystore로 변경 |
| 2026-11-22 | 프론트엔드 구조 모듈화: `components/`, `hooks/`, `lib/domain/` 추가, `lib/tx` 컨트랙트별 분리, 라우트 전용 `_components/`, 모듈 의존 규칙(architecture.md 3.1) 추가 |
| 2026-11-22 | 구조 원칙 보완: 파일은 필요할 때 생성, `DATA_SOURCE` 선택 로직 제거, 서버 Provider / 클라이언트 Signer 분리(3.2), 서버 RPC 환경 변수 `SEPOLIA_RPC_URL` → `RPC_URL`, 테스트용 CID를 실제 조회 가능한 Pinata 샘플로 변경(6.4) |
| 2026-11-22 | Phase 1 · 2단계 완료: BSideNFT 구현, 테스트 37개 통과. architecture.md 4.1에 구현 세부 사항 추가 |
| 2026-11-22 | 2단계 검토 보완: 에스크로 직접 전송 차단 추가, "최초 판매 자격" 용어 정리, 4단계 배포 자동화 기준 추가, 테스트 45개 통과 |
| 2026-11-22 | Phase 1 · 3단계 완료: BSideEscrow 구현, 전체 테스트 106개 통과. architecture.md 4.2·4.4에 구현 세부 사항 추가 |
| 2026-11-23 | Phase 1 · 4단계 완료: 배포·발행 스크립트 분리 구현, 로컬 배포 검증. 샘플 CID 기록 파일 계획 제거 (Pinata 수동 업로드 CID 사용) |
| 2026-11-24 | Phase 1 · 5단계 구현: 조회 계층(`MarketReader`·chainReader), 지갑 연결, 목록·상세·토큰 이력 화면. 지갑 상태 관리 방식 변경(WalletProvider → 외부 저장소) |
| 2026-11-24 | Phase 1 · 5단계 완료: 실제 Pinata CID로 로컬 노드 발행·거래(LISTED → LOCKED → COMPLETED) 조회 검증. 규칙 11에 따라 조회·화면 파일 역할 분리 |
| 2026-11-24 | 5단계 보완: 로컬 실행 간소화(`setup:local`, README), 에스크로 보관 표시, 개발 모드 안전한 오류 원인 표시, 지갑 선택 사항화·회원가입 없음 원칙 명시(proposal.md 3장) |
| 2026-11-24 | D7 확장: 아티스트 활동명 등록(`registerArtist`)·인증 표시. BSideNFT 수정·재배포, 테스트 113개 통과, 화면 계정 표시 규칙 통일(`AccountLabel`) |
| 2026-11-25 | Phase 1 · 6단계 구현: 거래 화면(관리자·발행·판매 등록·거래 버튼·내 거래·출금), `useTx`·`NetworkGuard`, 범위에 정산 청구·등록 취소·승인 회수 포함(사용자 결정). 흐름 A·B 수동 시연 대기 |
| 2026-11-25 | 6단계 브라우저 검증: 실제 Pinata CID로 흐름 A·B 전 과정 통과(테스트용 지갑 객체 사용). Activity 상태 보존으로 인한 표시 문제 2건 수정(판매 등록 완료 표시, 거래 버튼 상태) |
| 2026-11-26 | Phase 1 · 6단계 완료: 사용자 MetaMask 흐름 A·B 확인. 네트워크 전환 시 MetaMask 내부 오류 1건 기록(우회: MetaMask에서 직접 선택) |
| 2026-11-26 | 업로드 기능 결정 (D11 상태 기록 항목·사진 제한, D12 지갑 서명·서버 기록 작성, D13 발행 메타데이터 업로드 추가). Phase 2 업로드를 7단계보다 먼저 진행하기로 하고 U1~U4로 나눔 |
| 2026-11-26 | U1 완료: 업로드 확인 서명·권한 확인, Pinata v3 업로드, `POST /api/ipfs/images`. 거부 테스트 13건·실제 업로드 확인. 정책 범위 표기 D1~D13 |
| 2026-11-26 | U2 구현: 판매 등록 화면에서 상태·사진 입력 → 서버가 상태 기록 작성·업로드 → list. API·흐름 검증 통과, 사용자 MetaMask 화면 확인으로 완료. MetaMask가 감싼 nonce 오류 안내 수정 |
| 2026-11-26 | U3 구현: 발행 화면에서 이름·설명·대표 이미지 입력 → 서버가 메타데이터 업로드 → mint. API·흐름 검증 통과, 사용자 MetaMask 화면 확인으로 완료 |
| 2026-11-26 | D11 변경(사용자 결정): 최초 판매는 상태·사진 입력 없이 서버가 "아티스트 최초 판매" 상태 기록 자동 작성(사진 = 발행 대표 이미지). 상태 기록에 `type` 추가. API 검증 11건 통과, 사용자 화면 확인으로 완료 |
| 2026-11-26 | U4 구현: 토큰 이력·거래 상세에 거래별 상태 기록 내용·사진 표시, 기록 형식 확인·어긋남 경고. 게이트웨이 요청을 CID로 제한(최초 판매 기록 작성의 tokenURI 요청 보완), `IpfsLink` 안전 처리. 검증 21건 통과, 사용자 화면 확인으로 완료 |
| 2026-11-26 | Pinata 테스트 파일 정리: 검증 스크립트가 올린 9개(1×1 PNG, U2 상태 기록 2개, U3 메타데이터 1개, 최초 판매 검증 상태 기록 5개)를 사용자 요청으로 v3 API로 삭제(모두 HTTP 200). 사용자가 화면에서 직접 올린 파일과 Phase 1 수동 업로드는 유지 |
| 2026-11-27 | 7단계 시작: Sepolia `confirmPeriod` 300초 결정(미결정 사항 해소), 구매 시점 기준 기한은 MVP 단순화로 명시, 배송 완료 기준 기한을 향후 개선 사항에 추가. `deploy:sepolia` 스크립트 추가 |
| 2026-11-27 | Sepolia 배포(BSideNFT `0xAC41…93eF`, BSideEscrow `0xe696…8c60`) 및 온체인 설정 확인. 서버 조회 RPC를 publicnode로 전환. Vercel 시연 배포(https://bside-marketplace.vercel.app) 응답 확인 |
| 2026-11-27 | Phase 1 · 7단계 완료: 사용자가 Vercel 링크에서 Sepolia 흐름 A·B 시연 확인. Phase 1 전 단계 완료 |

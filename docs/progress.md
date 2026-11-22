# B-SIDE — 개발 진행 상황

> 이 문서는 개발 단계와 진행 상황을 기록한다.
> 기능 범위(Phase 구분)는 [proposal.md](proposal.md) 6장, 설계 세부 사항은 [architecture.md](architecture.md)를 따른다.
> 각 단계가 끝나면 체크 표시, 테스트 결과, 미완성 사항을 이 문서에 갱신한다.

## 현재 상태

- **단계**: Phase 1 · 1단계 완료
- **다음 작업**: Phase 1 · 2단계 (BSideNFT 구현 및 테스트) — 사용자 승인 후 시작
- **저장소 상태**: Next.js 16.4.6 초기 화면 + `contracts/` Hardhat 3 프로젝트 (컨트랙트 코드 없음)

## 진행 원칙

- 한 번에 한 단계씩 진행하고, 단계가 끝날 때마다 변경 파일과 테스트 결과를 보고한 뒤 승인을 받아 다음 단계로 넘어간다.
- 테스트 실패나 미완성 기능은 "비고"에 그대로 기록한다.

## Phase 1 — 핵심 거래 MVP

| 단계 | 작업 | 완료 기준 | 상태 |
|---|---|---|---|
| 1 | 개발 환경 구성: `contracts/` Hardhat 프로젝트, OpenZeppelin 설치, `.gitignore`·`.env.example` 정리 | Hardhat 샘플 컴파일 성공, 비밀값 파일이 git에서 제외됨 | ☑ 완료 |
| 2 | BSideNFT 구현 및 테스트 | architecture.md 9장의 BSideNFT 테스트 통과 | ☐ 대기 |
| 3 | BSideEscrow 전체 상태 머신 구현 및 테스트 (등록·취소·구매·승인·기한 정산·판매자 환불·분쟁·중재·출금) | architecture.md 9장의 Escrow·정산·보안 테스트 통과 | ☐ 대기 |
| 4 | 배포 스크립트: 로컬 노드·Sepolia 배포, ABI·주소·배포 블록을 `lib/contracts/`로 내보내기 | 로컬 노드 배포 성공 | ☐ 대기 |
| 5 | 프론트 기반: 지갑 연결, `MarketReader`·chainReader, 목록·상세·토큰 이력 페이지 | `npm run lint`, `npm run build` 통과, 로컬 노드 데이터 조회 확인 | ☐ 대기 |
| 6 | 거래 화면: 관리자 아티스트 등록, 발행, 판매 등록, 구매·수령 승인, 출금 (테스트용 샘플 CID 사용) | 로컬 노드에서 흐름 A·B 수동 시연 성공 | ☐ 대기 |
| 7 | Sepolia 배포 및 시연 점검 (짧은 `confirmPeriod`) | Sepolia에서 흐름 A·B 시연 성공 | ☐ 대기 |

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

참고: 컨트랙트의 환불·분쟁·중재 기능은 배포 후 변경이 어렵기 때문에 Phase 1(3단계)에서 함께 구현한다. 해당 화면(UI)은 Phase 2에서 만든다.

## Phase 2 — 상품 정보 및 거래 안정성

| 작업 | 상태 |
|---|---|
| Pinata 업로드 Route Handler (`/api/ipfs`) | ☐ 대기 |
| 상품 상태·사진 등록 화면 (샘플 CID를 실제 업로드로 교체) | ☐ 대기 |
| 과거 상품 상태 조회 | ☐ 대기 |
| 판매자 환불, 분쟁 제기 화면 | ☐ 대기 |
| 관리자 분쟁 중재 화면 | ☐ 대기 |
| 예외 상황 테스트 보강 | ☐ 대기 |

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


# B-SIDE 프로젝트

## 프로젝트 개요
B-SIDE는 독립 아티스트의 굿즈 재판매와
창작자 수익 환원을 지원하는 NFT 기반 중고거래 플랫폼이다.

## 문서 참조 관계

| 문서 | 역할 | 언제 보는가 |
|---|---|---|
| [docs/proposal.md](docs/proposal.md) | 서비스 요구사항과 확정 정책(D1~D10)의 기준 문서 | 구현 전 항상. 문서 간 충돌 시 최우선 |
| [docs/architecture.md](docs/architecture.md) | 시스템 구조, 컨트랙트 설계, 상태 전이, 데이터 흐름, 보안 한계, 테스트 전략 | 코드 작성 전 |
| [docs/progress.md](docs/progress.md) | 개발 단계와 진행 상황, 변경 이력 | 작업 시작 전과 단계 완료 후 |
| [AGENTS.md](AGENTS.md) | Next.js 버전별 문서 안내 (Next.js가 자동 관리) | Next.js 코드 작성 전 |

- 같은 내용을 여러 문서에 중복해 쓰지 않는다. 정책은 proposal.md, 구현 방법은 architecture.md, 진행 상황은 progress.md에만 쓰고 나머지는 링크로 참조한다.
- AGENTS.md는 Next.js가 자동으로 생성·관리하므로 수정하지 않는다.

## 기술 스택
- Frontend / Backend: Next.js 16 (App Router, Route Handlers)
- Language: TypeScript
- Styling: Tailwind CSS
- Smart Contract: Solidity, Hardhat, OpenZeppelin (ERC-721)
- Blockchain: Ethereum Sepolia
- Wallet: MetaMask, ethers.js
- Storage: IPFS (Pinata), MVP에서는 DB 없음

## 개발 규칙
1. 모든 설명과 작업 결과는 한국어로 작성한다.
2. 구현 전 docs/proposal.md와 docs/architecture.md를 확인한다.
3. 기획서에 없는 기능을 임의로 추가하지 않는다.
4. 모호한 요구사항은 구현 전에 질문한다. proposal.md "남은 미결정 사항"의 항목은 임의로 확정하지 않는다.
5. 기존 프로젝트 구조를 최대한 유지한다.
6. 한 번에 모든 기능을 구현하지 않고 단계별로 진행한다.
7. 코드 변경 후 가능한 테스트를 실행한다.
8. 테스트 실패나 미완성 기능을 숨기지 않는다.
9. 개인키, API 키 등 민감한 정보를 코드에 포함하지 않는다.
10. 작업 완료 후 변경 파일과 테스트 결과를 요약한다.
11. 기능별 폴더 구조로 모듈화해서 개발한다. UI, 비즈니스 로직, 컨트랙트 호출 코드는 분리하고, 파일 하나는 한 가지 역할만 하게 한다.

## 문서 갱신 규칙
- 정책(D1~D10)을 변경해야 하면 먼저 사용자에게 확인한 뒤 proposal.md를 수정하고, 그다음 architecture.md와 코드를 맞춘다.
- 설계를 변경하면 architecture.md를 함께 수정한다. 코드와 설계 문서가 어긋난 상태로 두지 않는다.
- 각 단계가 끝나면 progress.md의 상태, 테스트 결과, 미완성 사항, 변경 이력을 갱신한다.

## Next.js 개발 규칙

- 프로젝트 루트의 AGENTS.md를 확인한다.
- Next.js 관련 코드를 작성하거나 수정하기 전에
  AGENTS.md에서 안내하는 버전별 문서를 참고한다.
- 기존 학습 데이터보다 현재 설치된 Next.js 문서를 우선한다.
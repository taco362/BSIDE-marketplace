// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title B-SIDE 굿즈 NFT
/// @notice 승인된 아티스트가 실물 굿즈에 대응하는 NFT를 발행하고, 발행 시 재판매 정책을 기록한다.
///         정책은 발행 이후 누구도 변경할 수 없다. (docs/architecture.md 4.1)
contract BSideNFT is ERC721URIStorage, AccessControl {
    /// @notice NFT를 발행할 수 있는 승인된 아티스트 권한 (관리자가 grantRole/revokeRole로 관리, D7)
    bytes32 public constant ARTIST_ROLE = keccak256("ARTIST_ROLE");

    /// @notice 정책 수치 허용 범위 (basis point, 10000 = 100%) — D3
    uint16 public constant PRICE_CAP_MIN_BPS = 10_000; // 최초 판매가의 100%
    uint16 public constant PRICE_CAP_MAX_BPS = 15_000; // 최초 판매가의 150%
    uint16 public constant ROYALTY_MIN_BPS = 100; // 1%
    uint16 public constant ROYALTY_MAX_BPS = 1_000; // 10%

    /// @notice 아티스트 활동명 최대 길이 (UTF-8 바이트, 한글 약 21자)
    uint256 public constant MAX_ARTIST_NAME_BYTES = 64;

    /// @notice 재판매 정책: 정가 보호형, 창작자 상생형, 자유 거래형
    enum Policy {
        PriceCap,
        Royalty,
        Free
    }

    /// @notice 발행 시 기록되는 토큰 정보. 수정 함수가 없으므로 발행 후 변경되지 않는다.
    struct TokenInfo {
        address artist;
        uint256 initialPrice;
        Policy policy;
        uint16 policyBps;
    }

    /// @notice 묶음 조회(getTokens)용 반환 형식
    struct TokenView {
        uint256 tokenId;
        address owner;
        TokenInfo info;
        bool primaryEnded;
        string tokenURI;
    }

    /// @notice 에스크로 컨트랙트 주소. setEscrow로 1회만 설정할 수 있다.
    address public escrow;

    /// @notice 관리자가 등록한 아티스트 활동명 (D7). 승인이 회수되어도 기록은 남는다.
    ///         인증 여부는 hasRole(ARTIST_ROLE, 주소)로 판단한다.
    mapping(address artist => string) public artistName;

    uint256 private _totalMinted;
    mapping(uint256 tokenId => TokenInfo) private _tokenInfos;
    mapping(uint256 tokenId => bool) private _primaryEnded;

    event EscrowSet(address indexed escrow);
    event ArtistRegistered(address indexed artist, string name);

    error EmptyTokenURI();
    error EmptyArtistName();
    error ArtistNameTooLong(uint256 length);
    error ZeroInitialPrice();
    error InvalidPolicyBps(Policy policy, uint16 policyBps);
    error EscrowAlreadySet();
    error ZeroAddress();
    error DirectTransferToEscrow();

    /// @param admin 관리자 주소 (아티스트 등록·회수, 에스크로 설정 권한)
    constructor(address admin) ERC721("B-SIDE Goods", "BSIDE") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ───────────────────────── 발행 ─────────────────────────

    /// @notice 승인된 아티스트가 자기 지갑으로 NFT를 발행한다.
    /// @param uri NFT 메타데이터 주소 (예: ipfs://<CID>)
    /// @param initialPrice 최초 판매가 (wei)
    /// @param policy 재판매 정책
    /// @param policyBps 정책 수치 (PriceCap: 상한 bps, Royalty: 로열티 bps, Free: 0)
    /// @return tokenId 발행된 토큰 ID (1부터 시작)
    function mint(
        string calldata uri,
        uint256 initialPrice,
        Policy policy,
        uint16 policyBps
    ) external onlyRole(ARTIST_ROLE) returns (uint256 tokenId) {
        if (bytes(uri).length == 0) revert EmptyTokenURI();
        if (initialPrice == 0) revert ZeroInitialPrice();
        _validatePolicy(policy, policyBps);

        tokenId = ++_totalMinted;

        // 주의: _update의 최초 판매 판정이 artist를 읽으므로 반드시 _mint보다 먼저 기록한다.
        _tokenInfos[tokenId] = TokenInfo({
            artist: msg.sender,
            initialPrice: initialPrice,
            policy: policy,
            policyBps: policyBps
        });

        // 수신 콜백이 없는 _mint 사용: 받는 주소가 발행자 본인이므로 _safeMint가 필요 없다.
        _mint(msg.sender, tokenId);
        _setTokenURI(tokenId, uri);
    }

    // ───────────────────────── 관리자 ─────────────────────────

    /// @notice 아티스트 승인과 활동명 등록을 한 번에 한다 (D7).
    ///         이미 승인된 주소에 다시 호출하면 활동명만 갱신된다. 회수는 revokeRole(ARTIST_ROLE, artist)을 사용한다.
    /// @param name 활동명 (1 ~ MAX_ARTIST_NAME_BYTES 바이트)
    function registerArtist(address artist, string calldata name) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (artist == address(0)) revert ZeroAddress();
        uint256 length = bytes(name).length;
        if (length == 0) revert EmptyArtistName();
        if (length > MAX_ARTIST_NAME_BYTES) revert ArtistNameTooLong(length);

        artistName[artist] = name;
        _grantRole(ARTIST_ROLE, artist);
        emit ArtistRegistered(artist, name);
    }

    /// @notice 에스크로 컨트랙트 주소를 등록한다. 1회만 호출할 수 있다.
    function setEscrow(address escrow_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (escrow != address(0)) revert EscrowAlreadySet();
        if (escrow_ == address(0)) revert ZeroAddress();
        escrow = escrow_;
        emit EscrowSet(escrow_);
    }

    // ───────────────────────── 조회 ─────────────────────────

    /// @notice 토큰 정보를 조회한다. 존재하지 않는 토큰이면 revert한다.
    function getTokenInfo(uint256 tokenId) external view returns (TokenInfo memory) {
        _requireOwned(tokenId);
        return _tokenInfos[tokenId];
    }

    /// @notice 최초 판매 자격이 남아 있는지 조회한다. (D9)
    /// @dev 자격 종료는 "플랫폼에서 최초 판매가 완료됨"과 같은 뜻이 아니다. 외부 전송으로도 종료된다.
    ///      플랫폼 최초 판매 완료 여부는 에스크로 거래 기록(isPrimary + COMPLETED)으로 판단한다.
    function isPrimaryAvailable(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return !_primaryEnded[tokenId];
    }

    /// @notice 지금까지 발행된 토큰 수. 토큰 ID는 1 ~ totalMinted 이다.
    function totalMinted() external view returns (uint256) {
        return _totalMinted;
    }

    /// @notice 토큰 정보와 현재 소유자를 묶음으로 조회한다.
    /// @param offset 건너뛸 개수 (0이면 토큰 ID 1부터)
    /// @param limit 최대 조회 개수
    function getTokens(uint256 offset, uint256 limit) external view returns (TokenView[] memory views) {
        uint256 total = _totalMinted;
        if (offset >= total || limit == 0) return new TokenView[](0);

        uint256 count = total - offset;
        if (count > limit) count = limit;

        views = new TokenView[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = offset + i + 1;
            views[i] = TokenView({
                tokenId: tokenId,
                owner: _ownerOf(tokenId),
                info: _tokenInfos[tokenId],
                primaryEnded: _primaryEnded[tokenId],
                tokenURI: tokenURI(tokenId)
            });
        }
    }

    // ───────────────────────── 내부 ─────────────────────────

    function _validatePolicy(Policy policy, uint16 policyBps) private pure {
        bool valid;
        if (policy == Policy.PriceCap) {
            valid = policyBps >= PRICE_CAP_MIN_BPS && policyBps <= PRICE_CAP_MAX_BPS;
        } else if (policy == Policy.Royalty) {
            valid = policyBps >= ROYALTY_MIN_BPS && policyBps <= ROYALTY_MAX_BPS;
        } else {
            valid = policyBps == 0;
        }
        if (!valid) revert InvalidPolicyBps(policy, policyBps);
    }

    /// @dev 1) 에스크로 직접 전송 차단: 에스크로로 들어가는 전송은 에스크로 자신이 실행한 경우(= list())만 허용한다.
    ///         소유자가 transferFrom으로 에스크로에 바로 보내면 판매 등록 기록이 없어 NFT가 영구히 묶이기 때문이다.
    ///      2) 최초 판매 자격 판정 (D9): 받는 주소가 소각(0), 해당 토큰의 아티스트, 에스크로 중 어느 것도 아니면
    ///         NFT가 아티스트 손을 떠난 것으로 보고 최초 판매 자격을 종료한다. 한 번 종료되면 되돌리지 않는다.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        if (to == escrow && to != address(0) && auth != escrow) revert DirectTransferToEscrow();

        from = super._update(to, tokenId, auth);
        if (
            !_primaryEnded[tokenId] &&
            to != address(0) &&
            to != _tokenInfos[tokenId].artist &&
            to != escrow
        ) {
            _primaryEnded[tokenId] = true;
        }
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

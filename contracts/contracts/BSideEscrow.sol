// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {BSideNFT} from "./BSideNFT.sol";

/// @title B-SIDE 에스크로
/// @notice NFT와 거래 대금을 예치하고, 상태 전이 규칙에 따라 정산·환불한다. (docs/architecture.md 4.2 ~ 5.2)
/// @dev - 정산·환불 금액은 pendingWithdrawals에 적립하고 수령자가 withdraw()로 직접 출금한다 (pull payment).
///      - 모든 NFT 전송은 transferFrom을 사용한다 (수신 콜백으로 인한 DoS·재진입 방지).
///      - IERC721Receiver, receive, fallback을 구현하지 않는다.
contract BSideEscrow is ReentrancyGuard, AccessControl {
    /// @notice 분쟁 중재 권한 (D5)
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");

    uint256 private constant BPS_DENOMINATOR = 10_000;

    enum Status {
        LISTED,
        LOCKED,
        COMPLETED,
        CANCELLED,
        DISPUTED
    }

    enum CancelReason {
        SellerCancelled, // LISTED 상태에서 판매자 취소
        SellerRefunded, // LOCKED 상태에서 판매자 자발적 환불 (D4)
        DisputeRefunded // 분쟁 중재 결과 구매자 환불 (D5)
    }

    struct Listing {
        uint256 tokenId;
        address seller;
        address buyer;
        uint256 price;
        string conditionCID;
        Status status;
        bool isPrimary;
        uint64 listedAt;
        uint64 lockedAt;
        uint64 closedAt;
    }

    /// @notice 묶음 조회(getListings)용 반환 형식
    struct ListingView {
        uint256 listingId;
        Listing listing;
    }

    BSideNFT public immutable nft;

    /// @notice 구매(LOCKED) 후 수령 승인 기한 (초). deadline = lockedAt + confirmPeriod (D2)
    uint256 public immutable confirmPeriod;

    /// @notice 주소별 출금 대기액
    mapping(address account => uint256) public pendingWithdrawals;

    uint256 private _listingCount;
    mapping(uint256 listingId => Listing) private _listings;

    event Listed(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed seller,
        uint256 price,
        string conditionCID,
        bool isPrimary
    );
    event Purchased(uint256 indexed listingId, uint256 indexed tokenId, address indexed buyer);
    event Completed(
        uint256 indexed listingId,
        uint256 indexed tokenId,
        address indexed seller,
        address buyer,
        uint256 price,
        uint256 royalty,
        string conditionCID
    );
    event Cancelled(uint256 indexed listingId, uint256 indexed tokenId, CancelReason reason);
    event Disputed(uint256 indexed listingId, uint256 indexed tokenId, address indexed buyer);
    event DisputeResolved(uint256 indexed listingId, bool refundBuyer);
    event Withdrawn(address indexed account, uint256 amount);

    error ZeroAddress();
    error ZeroConfirmPeriod();
    error EscrowNotRegistered();
    error ListingNotFound(uint256 listingId);
    error InvalidStatus(uint256 listingId, Status current);
    error NotTokenOwner();
    error NotSeller();
    error NotBuyer();
    error EmptyConditionCID();
    error ZeroPrice();
    error PrimaryPriceMismatch(uint256 initialPrice, uint256 price);
    error PriceExceedsCap(uint256 cap, uint256 price);
    error SelfPurchase();
    error IncorrectPayment(uint256 price, uint256 sent);
    error DeadlinePassed();
    error DeadlineNotReached();
    error NothingToWithdraw();
    error WithdrawFailed();

    /// @param admin 관리자 주소 (DEFAULT_ADMIN_ROLE, ARBITER_ROLE 부여)
    /// @param nft_ BSideNFT 주소
    /// @param confirmPeriod_ 수령 승인 기한 (초). 시연용으로 짧게 설정할 수 있다.
    constructor(address admin, BSideNFT nft_, uint256 confirmPeriod_) {
        if (admin == address(0) || address(nft_) == address(0)) revert ZeroAddress();
        if (confirmPeriod_ == 0) revert ZeroConfirmPeriod();
        nft = nft_;
        confirmPeriod = confirmPeriod_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ARBITER_ROLE, admin);
    }

    // ───────────────────────── 판매 등록 / 취소 ─────────────────────────

    /// @notice NFT를 예치하고 판매를 등록한다. 사전에 이 컨트랙트에 대한 approve가 필요하다.
    /// @param conditionCID 상품 상태 기록의 IPFS CID (등록 시점에 고정된다)
    /// @return listingId 거래 ID (1부터 시작)
    function list(
        uint256 tokenId,
        uint256 price,
        string calldata conditionCID
    ) external nonReentrant returns (uint256 listingId) {
        // 최초 판매 자격 판정과 직접 전송 차단이 이 에스크로를 기준으로 동작해야 한다.
        if (nft.escrow() != address(this)) revert EscrowNotRegistered();
        if (nft.ownerOf(tokenId) != msg.sender) revert NotTokenOwner();
        if (bytes(conditionCID).length == 0) revert EmptyConditionCID();
        if (price == 0) revert ZeroPrice();

        BSideNFT.TokenInfo memory info = nft.getTokenInfo(tokenId);
        bool isPrimary = msg.sender == info.artist && nft.isPrimaryAvailable(tokenId);

        if (isPrimary) {
            // 최초 판매가는 발행 시 기록한 가격으로 고정 (D1)
            if (price != info.initialPrice) revert PrimaryPriceMismatch(info.initialPrice, price);
        } else if (info.policy == BSideNFT.Policy.PriceCap) {
            // 재판매(아티스트 본인의 재판매 포함, D10): 정가 보호형 상한
            uint256 cap = (info.initialPrice * info.policyBps) / BPS_DENOMINATOR;
            if (price > cap) revert PriceExceedsCap(cap, price);
        }

        listingId = ++_listingCount;
        _listings[listingId] = Listing({
            tokenId: tokenId,
            seller: msg.sender,
            buyer: address(0),
            price: price,
            conditionCID: conditionCID,
            status: Status.LISTED,
            isPrimary: isPrimary,
            listedAt: uint64(block.timestamp),
            lockedAt: 0,
            closedAt: 0
        });
        emit Listed(listingId, tokenId, msg.sender, price, conditionCID, isPrimary);

        nft.transferFrom(msg.sender, address(this), tokenId);
    }

    /// @notice 구매 전(LISTED) 판매 등록을 취소하고 NFT를 돌려받는다.
    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage l = _getListing(listingId);
        _requireStatus(listingId, l, Status.LISTED);
        if (msg.sender != l.seller) revert NotSeller();

        l.status = Status.CANCELLED;
        l.closedAt = uint64(block.timestamp);
        emit Cancelled(listingId, l.tokenId, CancelReason.SellerCancelled);

        nft.transferFrom(address(this), l.seller, l.tokenId);
    }

    // ───────────────────────── 구매 / 수령 ─────────────────────────

    /// @notice 판매 가격과 정확히 같은 ETH를 예치하고 구매한다.
    function buy(uint256 listingId) external payable nonReentrant {
        Listing storage l = _getListing(listingId);
        _requireStatus(listingId, l, Status.LISTED);
        if (msg.sender == l.seller) revert SelfPurchase();
        if (msg.value != l.price) revert IncorrectPayment(l.price, msg.value);

        l.status = Status.LOCKED;
        l.buyer = msg.sender;
        l.lockedAt = uint64(block.timestamp);
        emit Purchased(listingId, l.tokenId, msg.sender);
    }

    /// @notice 구매자가 실물 수령을 승인한다. 기한과 관계없이 LOCKED 상태이면 가능하다.
    function confirmReceipt(uint256 listingId) external nonReentrant {
        Listing storage l = _getListing(listingId);
        _requireStatus(listingId, l, Status.LOCKED);
        if (msg.sender != l.buyer) revert NotBuyer();
        _complete(listingId, l);
    }

    /// @notice 기한(deadline) 이후 승인·이의가 없으면 판매자가 정산을 청구한다. (D2)
    function claimAfterTimeout(uint256 listingId) external nonReentrant {
        Listing storage l = _getListing(listingId);
        _requireStatus(listingId, l, Status.LOCKED);
        if (msg.sender != l.seller) revert NotSeller();
        if (block.timestamp < _deadline(l)) revert DeadlineNotReached();
        _complete(listingId, l);
    }

    /// @notice 판매자가 스스로 구매자에게 전액 환불하고 NFT를 돌려받는다. (D4)
    function refundBySeller(uint256 listingId) external nonReentrant {
        Listing storage l = _getListing(listingId);
        _requireStatus(listingId, l, Status.LOCKED);
        if (msg.sender != l.seller) revert NotSeller();
        _refund(listingId, l, CancelReason.SellerRefunded);
    }

    // ───────────────────────── 분쟁 ─────────────────────────

    /// @notice 구매자가 기한 안에 이의를 제기한다. 자동 정산이 보류된다. (D5)
    function openDispute(uint256 listingId) external nonReentrant {
        Listing storage l = _getListing(listingId);
        _requireStatus(listingId, l, Status.LOCKED);
        if (msg.sender != l.buyer) revert NotBuyer();
        if (block.timestamp >= _deadline(l)) revert DeadlinePassed();

        l.status = Status.DISPUTED;
        emit Disputed(listingId, l.tokenId, msg.sender);
    }

    /// @notice 중재자가 분쟁 결과를 결정한다. 두 결과 중 하나만 선택할 수 있다. (D5)
    /// @param refundBuyer true: 구매자 전액 환불 + NFT 판매자 반환, false: 판매자 정산 + NFT 구매자 이전
    function resolveDispute(uint256 listingId, bool refundBuyer) external onlyRole(ARBITER_ROLE) nonReentrant {
        Listing storage l = _getListing(listingId);
        _requireStatus(listingId, l, Status.DISPUTED);

        emit DisputeResolved(listingId, refundBuyer);
        if (refundBuyer) {
            _refund(listingId, l, CancelReason.DisputeRefunded);
        } else {
            _complete(listingId, l);
        }
    }

    // ───────────────────────── 출금 ─────────────────────────

    /// @notice 자신에게 적립된 금액을 출금한다.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        // 실패하면 전체가 되돌려지므로 대기액은 그대로 남고, 다시 시도할 수 있다.
        if (!ok) revert WithdrawFailed();

        emit Withdrawn(msg.sender, amount);
    }

    // ───────────────────────── 조회 ─────────────────────────

    /// @notice 지금까지 생성된 거래 수. 거래 ID는 1 ~ listingCount 이다.
    function listingCount() external view returns (uint256) {
        return _listingCount;
    }

    /// @notice 거래 정보를 묶음으로 조회한다.
    /// @param offset 건너뛸 개수 (0이면 거래 ID 1부터)
    /// @param limit 최대 조회 개수
    function getListings(uint256 offset, uint256 limit) external view returns (ListingView[] memory views) {
        uint256 total = _listingCount;
        if (offset >= total || limit == 0) return new ListingView[](0);

        uint256 count = total - offset;
        if (count > limit) count = limit;

        views = new ListingView[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 listingId = offset + i + 1;
            views[i] = ListingView({listingId: listingId, listing: _listings[listingId]});
        }
    }

    // ───────────────────────── 내부 ─────────────────────────

    /// @dev 정산: 상태를 먼저 COMPLETED로 바꾼 뒤 금액을 적립하고 NFT를 구매자에게 이전한다.
    function _complete(uint256 listingId, Listing storage l) private {
        l.status = Status.COMPLETED;
        l.closedAt = uint64(block.timestamp);

        BSideNFT.TokenInfo memory info = nft.getTokenInfo(l.tokenId);
        uint256 royalty;
        // 최초 판매는 로열티 없음(D1). 판매자가 아티스트 본인이면 0으로 기록(D10).
        if (info.policy == BSideNFT.Policy.Royalty && !l.isPrimary && l.seller != info.artist) {
            royalty = (l.price * info.policyBps) / BPS_DENOMINATOR; // 소수점 이하 버림
        }

        pendingWithdrawals[l.seller] += l.price - royalty;
        if (royalty > 0) pendingWithdrawals[info.artist] += royalty;

        emit Completed(listingId, l.tokenId, l.seller, l.buyer, l.price, royalty, l.conditionCID);

        nft.transferFrom(address(this), l.buyer, l.tokenId);
    }

    /// @dev 환불: 상태를 먼저 CANCELLED로 바꾼 뒤 구매자 환불액을 적립하고 NFT를 판매자에게 반환한다.
    function _refund(uint256 listingId, Listing storage l, CancelReason reason) private {
        l.status = Status.CANCELLED;
        l.closedAt = uint64(block.timestamp);

        pendingWithdrawals[l.buyer] += l.price;
        emit Cancelled(listingId, l.tokenId, reason);

        nft.transferFrom(address(this), l.seller, l.tokenId);
    }

    function _getListing(uint256 listingId) private view returns (Listing storage l) {
        if (listingId == 0 || listingId > _listingCount) revert ListingNotFound(listingId);
        l = _listings[listingId];
    }

    function _requireStatus(uint256 listingId, Listing storage l, Status expected) private view {
        if (l.status != expected) revert InvalidStatus(listingId, l.status);
    }

    function _deadline(Listing storage l) private view returns (uint256) {
        return uint256(l.lockedAt) + confirmPeriod;
    }
}

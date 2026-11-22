// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BSideEscrow} from "../BSideEscrow.sol";

/// @notice 테스트 전용 구매자 컨트랙트. 배포 대상이 아니다.
/// @dev - IERC721Receiver를 구현하지 않는다 → NFT를 처리할 수 없는 컨트랙트 구매자를 재현한다.
///      - mode에 따라 ETH 수신 동작을 바꾼다.
///        Accept: 정상 수신 / Reject: 수신 거부(출금 실패 재현) / Reenter: 수신 중 withdraw 재진입 시도
contract MockBuyer {
    enum Mode {
        Accept,
        Reject,
        Reenter
    }

    BSideEscrow public immutable escrow;
    Mode public mode;
    bool public reentryAttempted;
    bool public reentryBlocked;
    uint256 public receivedTotal;

    constructor(BSideEscrow escrow_) {
        escrow = escrow_;
    }

    function setMode(Mode mode_) external {
        mode = mode_;
    }

    function buy(uint256 listingId) external payable {
        escrow.buy{value: msg.value}(listingId);
    }

    function confirmReceipt(uint256 listingId) external {
        escrow.confirmReceipt(listingId);
    }

    function openDispute(uint256 listingId) external {
        escrow.openDispute(listingId);
    }

    function withdraw() external {
        escrow.withdraw();
    }

    receive() external payable {
        if (mode == Mode.Reject) revert("MockBuyer: reject");
        if (mode == Mode.Reenter) {
            reentryAttempted = true;
            try escrow.withdraw() {
                // 재진입이 성공하면 안 된다. 성공 시 reentryBlocked는 false로 남는다.
            } catch {
                reentryBlocked = true;
            }
        }
        receivedTotal += msg.value;
    }
}

/**
 * 컨트랙트의 모든 custom error에 한국어 안내 문구가 있는지 (lib/tx/errors.ts)
 * 문구가 없으면 화면에 "컨트랙트가 거부했습니다 (오류 이름)"만 나간다. 노드 없이 ABI로 오류 데이터를 만들어 확인한다.
 * 실제 호출로 확인하는 테스트는 txErrors.integration.ts (`npm run test:tx`)
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Interface, ZeroAddress, ZeroHash, type ErrorFragment, type ParamType } from "ethers";
import escrowAbi from "@/lib/contracts/abi/BSideEscrow.json";
import nftAbi from "@/lib/contracts/abi/BSideNFT.json";
import { toTxErrorMessage } from "@/lib/tx/errors";

function sample(param: ParamType): unknown {
  if (param.baseType === "address") return ZeroAddress;
  if (param.baseType === "bool") return false;
  if (param.baseType === "string") return "x";
  if (param.baseType === "bytes32") return ZeroHash;
  if (param.baseType.startsWith("bytes")) return "0x";
  if (param.baseType.startsWith("uint") || param.baseType.startsWith("int")) return 1;
  throw new Error(`테스트 값이 없는 타입: ${param.type}`);
}

for (const [name, abi] of [
  ["BSideEscrow", escrowAbi],
  ["BSideNFT", nftAbi],
] as const) {
  describe(`${name} custom error 문구`, () => {
    const iface = new Interface(abi);
    const errors: ErrorFragment[] = [];
    iface.forEachError((fragment) => errors.push(fragment));

    it("ABI에 custom error가 있다", () => assert.ok(errors.length > 0));
    for (const fragment of errors) {
      it(fragment.name, () => {
        const data = iface.encodeErrorResult(fragment, fragment.inputs.map(sample));
        // MetaMask가 감싼 모양 (revert data만 안쪽에 있음)
        const text = toTxErrorMessage({ code: -32603, message: "Internal JSON-RPC error.", data: { code: 3, data } });
        assert.doesNotMatch(text, /컨트랙트가 거부했습니다|트랜잭션 실패/, text);
      });
    }
  });
}

/** 금액·주소 변환과 입력 형식 확인 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatEth, isSameAddress, parseEth, shortenAddress } from "@/lib/domain/format";
import { checkAddress, checkArtistName } from "@/lib/domain/validation";
import { ETH } from "./fixtures";

describe("ETH 변환", () => {
  it("wei → ETH 문자열 (끝의 0 제거, 반올림 없음)", () => {
    assert.equal(formatEth(ETH / BigInt(20)), "0.05 ETH");
    assert.equal(formatEth(BigInt(1)), "0.000000000000000001 ETH");
    assert.equal(formatEth(ETH * BigInt(2)), "2 ETH");
    assert.equal(formatEth(BigInt(0)), "0 ETH");
  });
  it("ETH 문자열 → wei", () => {
    assert.equal(parseEth("0.05"), ETH / BigInt(20));
    assert.equal(parseEth(" 1 "), ETH);
    assert.equal(parseEth("0.000000000000000001"), BigInt(1));
  });
  it("잘못된 금액은 null (소수 19자리, 음수, 문자, 빈 값)", () => {
    for (const text of ["", "abc", "-1", "0.0000000000000000001", "1,000", ".5"]) {
      assert.equal(parseEth(text), null, text);
    }
  });
  it("formatEth와 parseEth는 서로 되돌린다", () => {
    const wei = BigInt("123456789012345678");
    assert.equal(parseEth(formatEth(wei).replace(" ETH", "")), wei);
  });
});

describe("주소", () => {
  it("대소문자 무시 비교, 빈 값은 다름", () => {
    assert.equal(isSameAddress("0xAbC", "0xabc"), true);
    assert.equal(isSameAddress(null, null), false);
    assert.equal(isSameAddress("0xabc", undefined), false);
  });
  it("축약 표시", () => {
    assert.equal(shortenAddress("0x1234567890abcdef1234567890abcdef12345678"), "0x1234…5678");
  });
  it("주소 형식 확인", () => {
    assert.equal(checkAddress("0x" + "a".repeat(40)), null);
    assert.notEqual(checkAddress("0x" + "a".repeat(39)), null);
    assert.notEqual(checkAddress("0x" + "g".repeat(40)), null);
  });
});

describe("활동명 길이 (UTF-8 64바이트, BSideNFT와 같음)", () => {
  it("빈 값 거부", () => assert.notEqual(checkArtistName(""), null));
  it("한글 21자(63바이트) 통과, 22자(66바이트) 거부", () => {
    assert.equal(checkArtistName("가".repeat(21)), null);
    assert.notEqual(checkArtistName("가".repeat(22)), null);
  });
  it("영문 64자 통과, 65자 거부", () => {
    assert.equal(checkArtistName("a".repeat(64)), null);
    assert.notEqual(checkArtistName("a".repeat(65)), null);
  });
});

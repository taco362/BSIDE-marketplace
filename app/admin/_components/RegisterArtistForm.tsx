"use client";

import { useState, type FormEvent } from "react";
import { TxStatus } from "@/components/tx/TxStatus";
import { FormField, INPUT_CLASS, SubmitButton } from "@/components/ui/FormField";
import { useTx } from "@/hooks/useTx";
import { MAX_ARTIST_NAME_BYTES, checkAddress, checkArtistName } from "@/lib/domain/validation";
import { registerArtist } from "@/lib/tx/nft";

/**
 * 아티스트 승인 + 활동명 등록. 이미 등록된 주소를 다시 등록하면 활동명만 바뀐다 (D7)
 * 관리자 지갑일 때만 보이도록 페이지가 RoleGate로 감싼다 (architecture.md 6.5). 권한은 컨트랙트가 확인한다.
 */
export function RegisterArtistForm() {
  return <Form />;
}

function Form() {
  const tx = useTx();
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const addressError = checkAddress(address.trim());
  const nameError = checkArtistName(name.trim());

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (addressError || nameError) return;
    const [artist, artistName] = [address.trim(), name.trim()];
    const receipts = await tx.run([{ label: "아티스트 등록", send: (s) => registerArtist(s, artist, artistName) }]);
    if (receipts) {
      setAddress("");
      setName("");
      setSubmitted(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <FormField label="아티스트 지갑 주소" htmlFor="artist-address" error={submitted ? addressError : null}>
        <input
          id="artist-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="0x…"
          autoComplete="off"
          className={`${INPUT_CLASS} font-mono`}
        />
      </FormField>
      <FormField
        label="활동명"
        htmlFor="artist-name"
        hint={`1 ~ ${MAX_ARTIST_NAME_BYTES}바이트 (한글 약 21자). 신원 확인은 플랫폼 밖에서 합니다.`}
        error={submitted ? nameError : null}
      >
        <input
          id="artist-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          className={INPUT_CLASS}
        />
      </FormField>
      <SubmitButton disabled={tx.busy}>{tx.busy ? "처리 중…" : "등록"}</SubmitButton>
      <TxStatus state={tx} successMessage="아티스트를 등록했습니다." />
    </form>
  );
}

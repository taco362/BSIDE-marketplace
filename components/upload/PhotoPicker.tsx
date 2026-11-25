"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, checkImageFile } from "@/lib/domain/upload";

export interface SelectedPhoto {
  id: string;
  file: File;
  /** 미리보기용 object URL (제거·언마운트 시 해제) */
  url: string;
}

/**
 * 사진 선택과 미리보기 (D11: JPEG·PNG·WebP, 장당 4MB)
 * 형식·크기는 여기서 안내만 하고, 최종 판별은 서버가 파일 바이트로 한다.
 * 선택한 사진은 부모가 상태로 갖고(value/onChange), 업로드는 제출할 때 한다.
 */
export function PhotoPicker({
  id,
  value,
  onChange,
  max,
  disabled = false,
}: {
  id: string;
  value: SelectedPhoto[];
  onChange: (photos: SelectedPhoto[]) => void;
  max: number;
  disabled?: boolean;
}) {
  const [rejected, setRejected] = useState<string[]>([]);
  const latest = useRef(value);

  useEffect(() => {
    latest.current = value;
  }, [value]);
  // 화면을 떠나 컴포넌트가 사라질 때 남은 미리보기 URL을 해제한다
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  function onSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = ""; // 같은 파일을 다시 고를 수 있게 초기화
    const errors: string[] = [];
    const added: SelectedPhoto[] = [];
    for (const file of files) {
      const error = checkImageFile(file);
      if (error) errors.push(`${file.name}: ${error}`);
      else if (value.length + added.length >= max) errors.push(`${file.name}: 사진은 ${max}장까지 올릴 수 있습니다.`);
      else added.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) });
    }
    setRejected(errors);
    if (added.length > 0) onChange([...value, ...added]);
  }

  function remove(photo: SelectedPhoto) {
    URL.revokeObjectURL(photo.url);
    onChange(value.filter((p) => p.id !== photo.id));
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((photo) => (
            <li key={photo.id} className="relative">
              {/* 로컬 미리보기(blob URL)라 next/image 최적화 대상이 아니다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.file.name}
                className="h-24 w-24 rounded-lg border border-zinc-200 object-cover dark:border-zinc-800"
              />
              <button
                type="button"
                onClick={() => remove(photo)}
                disabled={disabled}
                aria-label={`${photo.file.name} 삭제`}
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white hover:bg-black/80 disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.length < max && (
        <label
          htmlFor={id}
          className={`self-start rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
        >
          + 사진 추가 ({value.length}/{max})
          <input
            id={id}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            multiple
            disabled={disabled}
            onChange={onSelect}
            className="sr-only"
          />
        </label>
      )}
      <p className="text-xs text-zinc-500">
        JPEG·PNG·WebP, 장당 {MAX_IMAGE_BYTES / 1024 / 1024}MB 이하, 최대 {max}장. 올린 사진은 IPFS에 공개되며 지울 수 없으니 개인정보가 찍히지 않게 주의하세요.
      </p>
      {rejected.length > 0 && (
        <ul className="text-xs text-red-600">
          {rejected.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

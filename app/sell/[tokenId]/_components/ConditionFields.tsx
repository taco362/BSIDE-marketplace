"use client";

import { FormField, INPUT_CLASS } from "@/components/ui/FormField";
import { MAX_CONDITION_TEXT, NO_DEFECTS, type ConditionInput } from "@/lib/domain/upload";

/** 상품 상태 입력 (D11): 개봉 여부·사용 상태 필수, 하자 정보 선택 */
export function ConditionFields({
  value,
  onChange,
  error,
  disabled,
}: {
  value: ConditionInput;
  onChange: (value: ConditionInput) => void;
  error: string | null;
  disabled: boolean;
}) {
  return (
    <>
      <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
        <legend className="mb-1.5 text-sm font-medium">개봉 여부</legend>
        <div className="flex gap-4 text-sm">
          {[
            { label: "미개봉", sealed: true },
            { label: "개봉", sealed: false },
          ].map((option) => (
            <label key={option.label} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="sealed"
                checked={value.sealed === option.sealed}
                onChange={() => onChange({ ...value, sealed: option.sealed })}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <FormField label="사용 상태" htmlFor="condition-text" hint="예: 1회 청음, 자켓 모서리 약간 눌림 없음" error={error}>
        <textarea
          id="condition-text"
          value={value.condition}
          onChange={(e) => onChange({ ...value, condition: e.target.value })}
          maxLength={MAX_CONDITION_TEXT}
          rows={3}
          disabled={disabled}
          className={INPUT_CLASS}
        />
      </FormField>

      <FormField label="하자 정보 (선택)" htmlFor="defects-text" hint={`비우면 "${NO_DEFECTS}"으로 기록됩니다.`}>
        <textarea
          id="defects-text"
          value={value.defects}
          onChange={(e) => onChange({ ...value, defects: e.target.value })}
          maxLength={MAX_CONDITION_TEXT}
          rows={2}
          disabled={disabled}
          className={INPUT_CLASS}
        />
      </FormField>
    </>
  );
}

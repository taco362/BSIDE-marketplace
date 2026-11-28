/**
 * 비밀값 노출 점검 (docs/architecture.md 7장·9장)
 * 실행: `npm run build` 후 `npm run check:secrets`. 문제가 있으면 종료 코드 1.
 *
 * 1. 브라우저로 전달되는 빌드 결과(.next/static)에 키 형식·환경 변수 이름·RPC 키 주소·서버 전용 코드의 흔적이 없는지
 * 2. 서버 빌드 결과(.next/server)에도 키 값이 박혀 있지 않은지 (빌드 때 값이 코드에 들어가는 실수)
 * 3. 저장소에 올라간 파일에 .env 파일(.env.example 제외)이나 키 형식의 문자열이 없는지
 * 4. 소스에 NEXT_PUBLIC_ 변수가 없는지 (이 프로젝트는 브라우저용 환경 변수를 쓰지 않는다)
 * 5. (선택) 실제 키 값 비교: 실행한 사람의 환경 변수에 PINATA_JWT·GEMINI_API_KEY·RPC_URL이 있으면 그 값이 빌드 결과에 있는지
 *    찾는다. 값은 출력하지 않는다. 예: node --env-file=.env.local --import tsx scripts/check-secrets.ts
 *    (기본 실행은 .env.local을 읽지 않고 형식으로만 찾는다)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const STATIC_DIR = path.join(ROOT, ".next", "static");
const SERVER_DIR = path.join(ROOT, ".next", "server");

interface Pattern {
  name: string;
  regex: RegExp;
}

/** 키 값 형식 */
const KEY_PATTERNS: Pattern[] = [
  { name: "JWT (Pinata 키 형식)", regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "Google API 키 (Gemini 키 형식)", regex: /AIza[0-9A-Za-z_-]{35}/ },
  { name: "키가 들어간 RPC 주소 (Alchemy·Infura)", regex: /(alchemy\.com\/v2|infura\.io\/v3)\/[A-Za-z0-9_-]{8,}/ },
];

/** 브라우저 파일에 있으면 안 되는 것: 서버 전용 환경 변수 이름, 서버 전용 모듈의 흔적 */
const BROWSER_ONLY_PATTERNS: Pattern[] = [
  { name: "환경 변수 이름 PINATA_JWT", regex: /PINATA_JWT/ },
  { name: "환경 변수 이름 GEMINI_API_KEY", regex: /GEMINI_API_KEY/ },
  { name: "환경 변수 이름 RPC_URL", regex: /\bRPC_URL\b/ },
  { name: "서버 조회 RPC 주소 (publicnode)", regex: /publicnode\.com/ },
  { name: "Pinata API 주소 (lib/ipfs/pinata.ts)", regex: /(uploads|api)\.pinata\.cloud/ },
  { name: "Gemini API 주소 (lib/ai/gemini.ts)", regex: /generativelanguage\.googleapis\.com/ },
];

const problems: string[] = [];
const notes: string[] = [];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(js|mjs|cjs|json|html|css|txt|rsc|map|body|meta)$/.test(entry)) out.push(full);
  }
  return out;
}

function scan(label: string, files: string[], patterns: Pattern[]): void {
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const p of patterns) {
      if (p.regex.test(text)) problems.push(`${label}: ${p.name} — ${path.relative(ROOT, file)}`);
    }
  }
}

function git(args: string[]): string {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (error) {
    // git grep은 찾은 것이 없으면 종료 코드 1
    return (error as { stdout?: string }).stdout ?? "";
  }
}

if (!existsSync(STATIC_DIR) || !existsSync(SERVER_DIR)) {
  console.error("빌드 결과(.next/static, .next/server)가 없습니다. 먼저 npm run build를 실행하세요.");
  process.exit(1);
}

// 1·2. 빌드 결과
const staticFiles = filesUnder(STATIC_DIR);
const serverFiles = filesUnder(SERVER_DIR);
scan("브라우저 파일", staticFiles, [...KEY_PATTERNS, ...BROWSER_ONLY_PATTERNS]);
scan("서버 빌드", serverFiles, KEY_PATTERNS);
notes.push(`검사한 파일: 브라우저 ${staticFiles.length}개, 서버 ${serverFiles.length}개`);

// 3. 저장소 파일
const tracked = git(["ls-files"]).split("\n").filter(Boolean);
for (const file of tracked) {
  if (/(^|\/)\.env(\.|$)/.test(file) && !file.endsWith(".env.example")) problems.push(`저장소: .env 파일이 커밋되어 있음 — ${file}`);
}
for (const p of KEY_PATTERNS) {
  const hits = git(["grep", "-l", "-E", p.regex.source.replace(/\\\//g, "/"), "--", ".", ":!package-lock.json", ":!contracts/package-lock.json"])
    .split("\n")
    .filter(Boolean);
  for (const file of hits) problems.push(`저장소: ${p.name} — ${file}`);
}
notes.push(`검사한 저장소 파일: ${tracked.length}개`);

// 4. NEXT_PUBLIC_ 변수
const publicVars = git(["grep", "-l", "NEXT_PUBLIC_", "--", "app", "lib", "components", "hooks"]).split("\n").filter(Boolean);
for (const file of publicVars) problems.push(`소스: NEXT_PUBLIC_ 변수 사용 — ${file}`);

// 5. 실제 값 비교 (선택)
const secretNames = ["PINATA_JWT", "GEMINI_API_KEY", "RPC_URL"] as const;
const provided = secretNames.filter((name) => (process.env[name] ?? "").length >= 8);
if (provided.length === 0) {
  notes.push("실제 키 값 비교: 건너뜀 (환경 변수 없음, 형식으로만 검사)");
} else {
  for (const name of provided) {
    const value = process.env[name] as string;
    const found = staticFiles.find((file) => readFileSync(file, "utf8").includes(value));
    if (found) problems.push(`브라우저 파일: ${name}의 실제 값 — ${path.relative(ROOT, found)}`);
  }
  notes.push(`실제 키 값 비교: ${provided.join(", ")} (값은 출력하지 않음)`);
}

for (const note of notes) console.log(`- ${note}`);
if (problems.length > 0) {
  console.error(`\n비밀값 노출 의심 ${problems.length}건:`);
  for (const p of problems) console.error(`  ✖ ${p}`);
  process.exit(1);
}
console.log("\n✔ 비밀값 노출 없음");

# 로컬 개발 환경 세팅 가이드

**대상**: 아무것도 깔려있지 않은 새 노트북에서 우리 가족 금융 내비게이터를 처음부터 띄우려는 사람.
**소요 시간**: 평균 30~45분 (Docker 이미지 다운로드 포함).
**필요한 사양**: RAM 8GB 이상, 디스크 여유 5GB, 인터넷 연결.

---

## 0. 한눈에 보는 흐름

```mermaid
flowchart LR
    A["1. 도구 설치<br/>Git · Node 20<br/>pnpm · Docker<br/>Supabase CLI"]
    B["2. 코드 가져오기<br/>git clone<br/>pnpm install"]
    C["3. 백엔드 띄우기<br/>Docker 시작<br/>supabase start<br/>db reset"]
    D["4. 앱 실행<br/>pnpm dev<br/>(api:3000 + web:5173)"]
    E(["🌐 브라우저 접속<br/>http://127.0.0.1:5173"])
    A --> B --> C --> D --> E
```

---

## 1. 필수 도구 설치

OS별로 분기됩니다. 본인 OS 섹션만 따라하세요.

### 1-A. macOS

#### 1-A-1. Homebrew (패키지 매니저)
이미 설치돼 있으면 건너뛰세요. 확인: `brew --version`.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

설치 후 안내되는 `eval ...` 명령을 그대로 실행해서 `brew`를 PATH에 등록하세요.

#### 1-A-2. Node.js 20+
Node 24.x도 동작 확인됨. 권장: nvm으로 버전 관리.

```bash
# 옵션 A — 단순 설치 (Homebrew)
brew install node@20

# 옵션 B — 버전 매니저 (권장, 여러 프로젝트 운영 시)
brew install nvm
mkdir -p ~/.nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install 20
nvm use 20
```

확인: `node --version` → `v20.x.x` 이상.

#### 1-A-3. pnpm
```bash
brew install pnpm
# 또는
npm install -g pnpm
```
확인: `pnpm --version` → `10.x` 이상.

#### 1-A-4. Docker Desktop
Supabase 로컬 스택이 컨테이너로 동작합니다.

```bash
# 옵션 A — Docker Desktop (공식, GUI 포함)
brew install --cask docker
open /Applications/Docker.app
# 첫 실행 시 로그인·튜토리얼 화면이 뜸. 무시 가능.

# 옵션 B — OrbStack (가벼움, 권장)
brew install --cask orbstack
open /Applications/OrbStack.app
```

확인: `docker ps` → 빈 표가 떠야 정상. "Cannot connect..." 에러가 나면 데몬이 안 켜진 것.

#### 1-A-5. Supabase CLI
```bash
brew install supabase/tap/supabase
```
확인: `supabase --version` → `2.x` 이상.

#### 1-A-6. Git
대부분 macOS에 기본 설치돼 있음. 없다면:
```bash
brew install git
```

---

### 1-B. Windows

> **권장**: WSL2 + Ubuntu에서 작업하면 macOS와 동일한 명령으로 진행 가능. 순수 Windows 환경도 가능하지만 약간 더 번거롭습니다.

#### 1-B-1. winget (Windows 패키지 매니저)
Windows 10 (1809+) / 11에 기본 포함. 확인: PowerShell에서 `winget --version`.

없으면 Microsoft Store에서 "앱 설치 프로그램(App Installer)" 검색해서 설치.

#### 1-B-2. Node.js 20+
PowerShell (관리자) 실행 후:

```powershell
# 옵션 A — 단순 설치
winget install OpenJS.NodeJS.LTS

# 옵션 B — 버전 매니저 (권장)
winget install Schniz.fnm
fnm install 20
fnm use 20
# .zshrc 대신 PowerShell profile에 자동완성 추가
fnm env --use-on-cd | Out-String | Invoke-Expression
```

확인: 새 PowerShell 창을 열고 `node --version`.

#### 1-B-3. pnpm
```powershell
# Node와 함께 자동 설치된 corepack 사용 (권장)
corepack enable
corepack prepare pnpm@latest --activate

# 또는
npm install -g pnpm
```
확인: `pnpm --version`.

#### 1-B-4. Docker Desktop + WSL2
Supabase가 Docker 기반이므로 필수.

1. **WSL2 활성화** (Windows 10 2004+ 또는 11):
   ```powershell
   wsl --install
   ```
   재부팅 요청 시 재부팅. 끝나면 Ubuntu가 기본 설치됨.

2. **Docker Desktop 설치**:
   ```powershell
   winget install Docker.DockerDesktop
   ```
   설치 후 Docker Desktop 실행 → Settings → General → "Use the WSL 2 based engine" 체크 (기본 ON).

3. **확인**: 새 PowerShell 또는 WSL Ubuntu 터미널에서:
   ```bash
   docker ps
   ```
   빈 표가 떠야 정상.

#### 1-B-5. Supabase CLI
```powershell
# 옵션 A — Scoop (권장)
irm get.scoop.sh | iex
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# 옵션 B — npm 직접 설치 (간단)
npm install -g supabase
```

확인: `supabase --version`.

#### 1-B-6. Git
```powershell
winget install Git.Git
```
또는 https://git-scm.com/download/win 에서 인스톨러 받기.

설치 시 옵션은 모두 기본값으로 OK.

---

## 2. 코드 가져오기

이 단계부터는 macOS / Windows 동일합니다 (WSL Ubuntu 권장).

```bash
# 원하는 작업 디렉토리로 이동
cd ~/workspace             # macOS / WSL
# 또는 Windows PowerShell
# cd $env:USERPROFILE\workspace

# 클론
git clone https://github.com/cw-20022379/money-manager.git
cd money-manager

# 의존성 설치 (모노레포 전체, 약 1~3분)
pnpm install
```

성공 시 `apps/api`, `apps/web`, `packages/shared` 각각의 `node_modules`가 생성됩니다.

---

## 3. Supabase 로컬 스택 시작

**Docker 데몬이 실행 중**인지 먼저 확인하세요 (Docker Desktop 아이콘 색상이 살아있어야 함).

```bash
# 첫 실행은 Docker 이미지 다운로드 때문에 3~5분 걸립니다
pnpm db:start

# 정상 종료 시 아래 같은 출력이 나옵니다:
#   API URL:                http://127.0.0.1:54321
#   GraphQL URL:            http://127.0.0.1:54321/graphql/v1
#   DB URL:                 postgresql://postgres:postgres@127.0.0.1:54322/postgres
#   Studio URL:             http://127.0.0.1:54323
#   Inbucket URL:           http://127.0.0.1:54324
#   anon key:               eyJ...
#   service_role key:       eyJ...
```

### 3-1. .env 파일 생성

`pnpm db:status --output json` 으로 모든 키를 한 번에 조회할 수 있습니다.

```bash
# 키 조회
pnpm db:status --output json
```

루트 디렉토리에 `.env.example`을 복사해 `.env`를 만드세요:

```bash
cp .env.example .env
```

`.env`를 열어 위 status 출력의 값으로 채웁니다:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<status에서 복사한 ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<status에서 복사한 SERVICE_ROLE_KEY>

VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<위 ANON_KEY와 동일>
VITE_API_URL=http://127.0.0.1:3000
```

`apps/api/.env`와 `apps/web/.env`도 같은 값으로 만들면 됩니다 (앱별로 분리되어 있어 각각 필요).

```bash
# 빠른 복사 (값은 동일해도 무방)
cat > apps/api/.env << 'EOF'
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<위 ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<위 SERVICE_ROLE_KEY>
API_PORT=3000
API_HOST=127.0.0.1
EOF

cat > apps/web/.env << 'EOF'
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<위 ANON_KEY>
VITE_API_URL=http://127.0.0.1:3000
EOF
```

> **Windows PowerShell 사용자**: `cat > ...` 대신 메모장이나 VS Code로 직접 파일을 만드세요. UTF-8 (BOM 없이) 인코딩으로 저장.

### 3-2. 마이그레이션 적용
```bash
pnpm db:reset
```

성공 시 `Finished supabase db reset on branch main.` 출력. 9개 테이블이 생성되고 시드 데이터(테스트 가족)가 들어갑니다.

확인: http://127.0.0.1:54323 (Supabase Studio) → 좌측 메뉴 "Table Editor" → 9개 테이블 표시.

---

## 4. 앱 실행

```bash
pnpm dev
```

두 프로세스가 병렬로 뜹니다:
```
apps/web dev:   VITE v5.4.21  ready
apps/web dev:   ➜  Local:   http://127.0.0.1:5173/
apps/api dev: [HH:MM:SS] INFO: Server listening at http://127.0.0.1:3000
```

브라우저에서 열기:
- 웹앱: http://127.0.0.1:5173
- API 헬스체크: http://127.0.0.1:3000/healthz
- Supabase Studio: http://127.0.0.1:54323
- 가짜 메일함(가입 인증 메일): http://127.0.0.1:54324

---

## 5. 동작 검증 (5분 체크리스트)

전체 흐름 한눈에:

```mermaid
sequenceDiagram
    autonumber
    participant A as 👨 사용자 A (일반 창)
    participant W as 🌐 Web (:5173)
    participant M as 📧 Mailpit (:54324)
    participant B as 👩 사용자 B (시크릿 창)

    A->>W: 계정 만들기 (이메일·비밀번호)
    W->>M: 가입 확인 메일 전송
    A->>M: "Confirm your mail" 클릭
    A->>W: 로그인 → 가족 만들기 (박씨네)
    A->>W: 홈 → "초대 토큰 만들기"
    A-->>B: 토큰 전달 (카톡 등)
    B->>W: 시크릿 창에서 가입
    B->>M: confirm
    B->>W: 로그인 → "초대 링크로 합류" (토큰 입력)
    Note over A,B: 부부 같은 family_id로 묶임
    A->>W: 목록 → 계좌·카드·정기지출 등록
    W-->>B: 🔔 Realtime 토스트<br/>"배우자가 ...을(를) 등록했어요"
    A->>W: 흐름도 → 트리 펼침 확인
    A->>W: 홈 → 이번달 합산 카드 확인
```

체크리스트:

1. http://127.0.0.1:5173 → "계정 만들기" → 이메일·비밀번호 입력
2. http://127.0.0.1:54324 (Mailpit) → 가입 확인 메일의 "Confirm your mail" 링크 클릭
3. 다시 5173 → 자동 로그인 → "가족 만들기" → 가족 이름·표시 이름 입력
4. 홈 → "초대 토큰 만들기" → 토큰 복사
5. **시크릿 창**에서 5173 → 다른 이메일로 가입 → confirm → 로그인 → "초대 링크로 합류" → 토큰 + 두 번째 사용자 이름 입력
6. 둘 중 한 명이 "목록 → + 새로 등록"으로 계좌·카드·정기지출 등록
7. 다른 사용자 화면에 토스트 `🔔 배우자가 ...을(를) 등록했어요` 자동 표시
8. 흐름도 탭 → 계좌→카드→머천트 트리 펼침 동작
9. 홈 탭 → "이번달 빠질 돈" 합산 + 한눈에 보기 카드

여기까지 모두 OK면 환경 세팅 완료.

---

## 6. 일상 명령

| 명령 | 설명 |
|---|---|
| `pnpm dev` | api(:3000) + web(:5173) 병렬 실행 |
| `pnpm db:start` | Supabase Docker 스택 시작 |
| `pnpm db:stop` | Supabase 중지 (다음 시작 시 데이터 유지) |
| `pnpm db:reset` | DB 초기화 + 마이그레이션 재적용 + 시드 |
| `pnpm db:studio` | Studio 브라우저로 열기 |
| `pnpm db:status` | 컨테이너 상태 + 키 출력 |
| `pnpm typecheck` | 전체 워크스페이스 타입 체크 |
| `pnpm build` | 전체 빌드 |

---

## 7. 자주 발생하는 문제

### 7-1. `EADDRINUSE: address already in use 127.0.0.1:3000`
이전 dev 프로세스가 안 죽었음.
```bash
# macOS / Linux
lsof -ti:3000 | xargs kill -9

# Windows PowerShell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

### 7-2. `Cannot connect to the Docker daemon`
Docker Desktop이 안 켜져 있음. 트레이/메뉴바 아이콘 확인 후 실행.

### 7-3. `supabase start`가 Edge Functions에서 SSL 인증서 에러
사내 네트워크 등에서 deno.land 인증서 검증 실패 가능. 토이 프로젝트에서는 Edge Functions 불필요하므로 비활성화돼 있음 (`supabase/config.toml`).

```toml
[edge_runtime]
enabled = false
```

### 7-4. Supabase Studio가 비어 보임 / 테이블 없음
마이그레이션 미적용. `pnpm db:reset` 한 번 실행.

### 7-5. 회원가입 후 메일 인증 링크 어디서?
Mailpit 가짜 메일함: http://127.0.0.1:54324. 실제 메일 전송 안 됨 (로컬은 SMTP 가짜).

### 7-6. 두 사용자 같은 가족에 묶이지 않음
초대 토큰을 정확히 복사했는지 확인. 토큰은 7일·일회용. Studio → `invite_tokens` 테이블에서 `used_at` 값 확인 가능.

### 7-7. Realtime 토스트가 안 뜸
- 본인 변경은 무시됨 (다른 사용자에게만 보임)
- `lifecycle_events`의 `notify_spouse` 값이 `true`여야 알림
- 브라우저 콘솔에서 WebSocket 연결 에러가 있는지 확인

### 7-8. Windows에서 pnpm 명령이 안 됨
PowerShell 실행 정책 문제. 관리자 PowerShell에서:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### 7-9. WSL Ubuntu에서 Windows의 Docker가 안 보임
Docker Desktop → Settings → Resources → WSL Integration → 본인 배포판 토글 ON.

---

## 8. 환경 정리 (다 끝났을 때)

```bash
# 컨테이너 중지 (다음 시작 때 데이터 유지)
pnpm db:stop

# 완전히 초기화 (데이터 삭제)
supabase stop --no-backup --project-id my-manager
docker volume prune
```

---

## 다음 단계
- 실제 서비스 배포: [`DEPLOY_FREE.md`](./DEPLOY_FREE.md) 참고
- 설계 문서: `family_finance_navigator_design_v1.md` (별도 리포 외부 위치)

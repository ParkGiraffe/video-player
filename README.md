# Video Player

크로스 플랫폼 커스텀 동영상 플레이어

## 기능

- 📁 폴더 마운트 및 재귀 스캔
- 🎬 MKV, AVI, MP4, WebM 등 다양한 포맷 지원 (mpv 사용)
- 🏷️ 태그, 참가자, 언어별 메타데이터 관리
- 🔍 필터링 및 검색
- 📷 썸네일 자동 감지
- 📝 SRT, ASS, VTT 자막 자동 로드
- 💾 재생 위치 저장
- 🖱️ 드래그앤드롭 파일 이동

## 요구 사항

### mpv 설치 (필수)

MKV, AVI 등 다양한 코덱을 지원하기 위해 mpv가 필요합니다.

#### macOS
```bash
# Homebrew 사용
brew install mpv
```

#### Windows
1. [mpv 공식 사이트](https://mpv.io/installation/)에서 다운로드
2. 또는 [Chocolatey](https://chocolatey.org/) 사용:
```bash
choco install mpv
```

#### Linux
```bash
# Ubuntu/Debian
sudo apt install mpv

# Fedora
sudo dnf install mpv

# Arch
sudo pacman -S mpv
```

## 개발

### 요구 사항
- Node.js 20.19+ 또는 22.12+
- Rust (rustup으로 설치)
- Tauri CLI

### 설치
```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run tauri dev
```

### 빌드
```bash
# 프로덕션 빌드
npm run tauri build
```

빌드된 앱은 `src-tauri/target/release/bundle/` 폴더에 생성됩니다.

## 사용 방법

1. **폴더 추가**: 사이드바에서 "폴더 추가" 버튼 클릭
2. **동영상 재생**: 더블클릭 시 mpv로 재생 (mpv 설치 필요)
3. **메타데이터 편집**: 동영상 선택 후 우측 패널에서 태그/참가자/언어 추가
4. **필터링**: 사이드바에서 태그/참가자/언어별 필터 적용

## 키보드 단축키 (내장 플레이어)

| 단축키 | 기능 |
|--------|------|
| `Space` / `K` | 재생/일시정지 |
| `←` / `→` | 10초 뒤로/앞으로 |
| `↑` / `↓` | 볼륨 조절 |
| `M` | 음소거 |
| `F` | 전체화면 |
| `Esc` | 플레이어 닫기 |

## 자막

동영상 파일과 같은 폴더에 동일한 이름의 자막 파일이 있으면 자동으로 로드됩니다.

지원 형식: `.srt`, `.ass`, `.ssa`, `.sub`, `.vtt`

예시:
```
/Videos/
  movie.mkv
  movie.srt  ← 자동 로드
```

## 썸네일

동영상 파일과 같은 폴더에 동일한 이름의 이미지 파일이 있으면 썸네일로 표시됩니다.

지원 형식: `.jpg`, `.jpeg`, `.png`, `.webp`

예시:
```
/Videos/
  movie.mkv
  movie.jpg  ← 썸네일로 표시
```

## 기술 스택

- **프론트엔드**: React, TypeScript, Zustand
- **백엔드**: Rust, Tauri v2
- **데이터베이스**: SQLite
- **비디오 재생**: mpv

## 라이선스

MIT
# video-player

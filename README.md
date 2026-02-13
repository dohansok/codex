# 음원 분석 코드/멜로디 악보 생성 앱

음원 파일(mp3, wav 등)을 업로드하면 다음 결과를 자동으로 생성하는 앱입니다.

- **코드 진행(Chord Chart)**
- **멜로디 악보(MusicXML / MIDI / PDF)**
- **구간별 템포, 키, 박자 정보**

---

## 1) 핵심 기능

1. **오디오 업로드**
   - mp3/wav/m4a 지원
   - 길이/용량 제한 및 변환(샘플레이트 통일)

2. **자동 음악 분석**
   - 키(Key) 추정
   - 템포(BPM) 추정
   - 코드 추정(마디 단위)
   - 멜로디 음고 추출(monophonic 우선)

3. **악보 생성**
   - 코드 심볼 + 멜로디 노트로 리드 시트 생성
   - **MusicXML, MIDI, PDF 동시 생성**
   - 다운로드/공유용 파일 URL 자동 발급

4. **편집 기능**
   - 잘못 인식된 코드/음표 수동 수정
   - 조옮김(Transpose)
   - 템포/박자 재설정

5. **프로젝트 저장/공유**
   - 분석 결과 프로젝트 저장
   - 링크 공유 또는 파일 다운로드

---

## 2) 기술 설계(권장)

### 백엔드
- **FastAPI**: 업로드/분석/결과 제공 API
- **Python 분석 스택**
  - `librosa`: onset, chroma, tempo, beat
  - `madmom` 또는 `essentia`: 박/구조 분석 보강
  - `basic-pitch` 또는 `crepe`: 멜로디 피치 추정
  - `music21`: 코드/노트 구조화, MusicXML/MIDI/PDF 렌더
- **PDF 렌더링 툴**
  - MuseScore CLI 또는 LilyPond(서버 렌더)
- **작업 큐**: Celery + Redis (긴 분석 비동기 처리)

### 프론트엔드
- **Next.js + TypeScript**
- 파형/구간 UI: Wavesurfer.js
- 악보 렌더: OpenSheetMusicDisplay(OSMD)

### 저장소
- PostgreSQL: 프로젝트 메타데이터
- S3(또는 로컬 스토리지): 원본 음원/결과 파일

---

## 3) 분석 파이프라인(MVP)

1. 파일 업로드
2. ffmpeg로 wav 변환(예: 44.1kHz mono)
3. 비트/박 추정
4. chroma 기반 코드 후보 추정 + 스무딩(HMM/Rule-based)
5. 멜로디 pitch contour 추정 + 양자화(박 단위)
6. 코드/멜로디 정렬
7. MusicXML 생성
8. MusicXML 기반 MIDI/PDF 렌더링
9. UI에서 미리보기 + 수동 보정 + 파일 다운로드

---

## 4) API 예시

### `POST /api/analyze`
업로드된 음원을 분석 작업으로 등록

```json
{
  "fileId": "audio_123",
  "options": {
    "detectKey": true,
    "detectChords": true,
    "detectMelody": true,
    "timeSignature": "auto",
    "export": ["musicxml", "midi", "pdf"]
  }
}
```

### `GET /api/analyze/{jobId}`
분석 상태/결과 조회

```json
{
  "status": "done",
  "result": {
    "key": "G major",
    "bpm": 122,
    "chords": [
      {"bar": 1, "symbol": "G"},
      {"bar": 2, "symbol": "D/F#"}
    ],
    "melody": [
      {"start": 0.0, "duration": 0.5, "pitch": "D4"}
    ],
    "musicxmlUrl": "/files/result_123.musicxml",
    "midiUrl": "/files/result_123.mid",
    "pdfUrl": "/files/result_123.pdf"
  }
}
```

### `GET /api/files/{fileId}`
파일 다운로드
- `Accept: audio/midi` → MIDI 반환
- `Accept: application/pdf` → PDF 반환

---

## 5) PDF / MIDI 출력 구현 팁

- **MIDI**: `music21.stream.Stream.write('midi', fp='result.mid')`
- **PDF**: `music21`에서 MusicXML 생성 후 MuseScore CLI로 PDF 변환
  - 예: `musescore result.musicxml -o result.pdf`
- 렌더링 실패 대비로 **재시도 큐**(최대 3회) 권장
- 대용량 처리 시 렌더링 단계를 별도 워커로 분리

---

## 6) 정확도 개선 전략

- 코드/멜로디를 **모델 앙상블**로 추정 후 합의
- 장르별 후처리 룰(발라드/EDM/재즈)
- 사용자 수정 로그를 학습 데이터로 축적
- 평가 지표
  - 코드: Chord Symbol Recall
  - 멜로디: Raw Pitch Accuracy / Note F1

---

## 7) 개발 로드맵

### Phase 1 (MVP, 4~6주)
- 업로드 + 분석 백엔드
- 코드/멜로디 자동 추출
- **MusicXML/MIDI/PDF 3종 다운로드**

### Phase 2 (고도화)
- 악보 에디터(수정/조옮김)
- 파트별 악보(보컬/피아노) 분리 출력
- 프로젝트 관리/공유

### Phase 3 (상용화)
- 실시간 분석(짧은 클립)
- 다성부(화음/베이스) 확장
- 모바일 앱 배포

---

## 8) 주의사항

- 상업 음원 업로드 시 저작권/이용약관 준수 필요
- 긴 음원은 처리 시간이 길어지므로 비동기 작업 필수
- 노이즈가 큰 라이브 음원은 후처리/수동 보정 UX가 중요
- 서버에 MuseScore/LilyPond가 없으면 PDF 생성이 실패할 수 있으므로 사전 설치 필요

---

원하시면 다음 단계로, 위 설계를 기반으로 **실행 가능한 FastAPI MVP 코드 구조**(폴더, 엔드포인트, 분석 모듈 스텁 + PDF/MIDI 변환 워커)**까지 바로 만들어드릴 수 있습니다.


## 9) 이제 어떻게 테스트해볼 수 있나? (로컬 기준)

아래 순서대로 하면 **샘플 음원 1개로 end-to-end 테스트**가 가능합니다.

1. **필수 도구 설치 확인**
   - Python 3.10+
   - ffmpeg
   - (PDF 필요 시) MuseScore CLI 또는 LilyPond

2. **백엔드 실행**
   - FastAPI 서버 실행 (`uvicorn app.main:app --reload`)
   - Celery 워커 실행 (`celery -A app.worker worker -l info`)

3. **샘플 음원 업로드/분석 요청**
   - `POST /api/analyze`에 `export: ["musicxml", "midi", "pdf"]` 포함
   - 응답으로 받은 `jobId` 저장

4. **작업 완료 폴링**
   - `GET /api/analyze/{jobId}`를 주기적으로 호출
   - `status == done`이 되면 `musicxmlUrl`, `midiUrl`, `pdfUrl` 확인

5. **파일 결과 검증**
   - MIDI: DAW 또는 VLC에서 재생 확인
   - PDF: 악보 레이아웃/마디/코드 심볼 확인
   - MusicXML: OSMD 또는 MuseScore로 열기

### 빠른 체크리스트
- `midiUrl`이 유효하고 파일 크기가 0보다 큰가?
- `pdfUrl`이 유효하고 악보가 깨지지 않는가?
- 코드 진행/멜로디가 원곡과 대략 일치하는가?
- 실패 시 워커 로그에 렌더링 에러(특히 MuseScore 경로)가 없는가?

### 자주 막히는 지점
- ffmpeg 미설치 → 전처리 실패
- MuseScore/LilyPond 미설치 → PDF만 실패
- 워커 미기동 → `status`가 오래 `processing`에 머묾
- 긴 음원/잡음 큰 음원 → 정확도 저하(수동 보정 필요)

---

## 10) 완전 초보자용: 처음부터 실행해보기 (복붙용)

아래는 **코딩을 잘 몰라도** 따라 할 수 있게, 최대한 단순하게 정리한 순서입니다.

### 0) 준비물
- 인터넷 연결
- 터미널(명령어 입력 창)
- 테스트할 음원 파일 1개 (`sample.mp3` 같은 파일)

### 1) 필수 프로그램 설치 확인
터미널에 아래를 한 줄씩 입력해보세요.

```bash
python --version
ffmpeg -version
```

- 버전 숫자가 나오면 정상입니다.
- `명령어를 찾을 수 없음`이 뜨면 해당 프로그램이 설치되지 않은 상태입니다.

### 2) 프로젝트 폴더로 이동

```bash
cd /workspace/codex
```

### 3) 서버 실행 (창 1번)
아래 명령어를 입력한 뒤, 이 창은 **켜둔 상태**로 두세요.

```bash
uvicorn app.main:app --reload
```

정상이라면 `Uvicorn running on ...` 같은 메시지가 보입니다.

### 4) 워커 실행 (창 2번, 새 터미널)
새 터미널 창을 하나 더 열고 아래를 입력하세요.

```bash
cd /workspace/codex
celery -A app.worker worker -l info
```

정상이라면 `ready` 비슷한 로그가 보입니다.

### 5) 분석 요청 보내기 (창 3번, 새 터미널)
또 새 터미널을 열고 아래 명령어를 실행하세요.

```bash
curl -X POST http://127.0.0.1:8000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "fileId": "audio_123",
    "options": {
      "detectKey": true,
      "detectChords": true,
      "detectMelody": true,
      "timeSignature": "auto",
      "export": ["musicxml", "midi", "pdf"]
    }
  }'
```

- 응답에서 `jobId` 값을 복사해두세요.

### 6) 완료될 때까지 확인
`<JOB_ID>`를 아까 받은 값으로 바꿔서 반복 실행합니다.

```bash
curl http://127.0.0.1:8000/api/analyze/<JOB_ID>
```

- `"status": "done"` 이 뜨면 성공입니다.
- 응답에 `musicxmlUrl`, `midiUrl`, `pdfUrl`가 나오면 파일 생성도 성공입니다.

### 7) 결과 파일 열어보기
- `midiUrl` 파일: VLC/DAW에서 재생
- `pdfUrl` 파일: PDF 뷰어로 열기
- `musicxmlUrl` 파일: MuseScore/OSMD로 열기

### 8) 자주 나오는 에러 (초보자 체크)
- `uvicorn: command not found` → Python/패키지 설치 문제
- `celery: command not found` → Celery 설치 문제
- PDF만 실패 → MuseScore 또는 LilyPond 미설치 가능성 큼
- 계속 `processing` 상태 → 워커(2번 창)가 꺼져 있을 가능성 큼

필요하면 다음 답변에서, 지금 환경 기준으로 **설치 명령어까지 1:1로** 더 쉽게 적어드릴게요.

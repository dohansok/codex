const fileInput = document.getElementById('audioFile');
const analyzeBtn = document.getElementById('analyzeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusEl = document.getElementById('status');
const player = document.getElementById('player');
const resultEl = document.getElementById('result');

let latestResult = null;
let latestFile = null;

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  latestFile = file;
  player.src = URL.createObjectURL(file);
  analyzeBtn.disabled = false;
  statusEl.textContent = `선택됨: ${file.name}`;
});

analyzeBtn.addEventListener('click', async () => {
  if (!latestFile) return;
  statusEl.textContent = '분석 중... (파일 길이에 따라 2~10초)';
  analyzeBtn.disabled = true;

  try {
    const buffer = await latestFile.arrayBuffer();
    const ctx = new AudioContext();
    const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));

    const duration = audioBuffer.duration;
    const channel = audioBuffer.getChannelData(0);
    const sr = audioBuffer.sampleRate;

    const bpm = estimateBpm(channel, sr);
    const chroma = estimateChroma(channel, sr);
    const key = estimateKey(chroma);
    const melody = estimateMelodyNotes(channel, sr, 16);
    const chords = estimateSimpleChords(key, Math.max(4, Math.round(duration / 8)));

    latestResult = {
      fileName: latestFile.name,
      durationSec: Number(duration.toFixed(2)),
      bpm,
      key,
      chords,
      melody,
      note: 'MVP 추정 결과입니다. 정확한 채보를 위해서는 서버 기반 고급 모델이 필요합니다.'
    };

    renderResult(latestResult);
    statusEl.textContent = '완료! 결과를 확인하세요.';
  } catch (e) {
    console.error(e);
    statusEl.textContent = '분석 실패: 브라우저에서 파일 디코딩을 지원하지 않거나 파일이 손상되었을 수 있습니다.';
  } finally {
    analyzeBtn.disabled = false;
  }
});

downloadBtn.addEventListener('click', () => {
  if (!latestResult) return;
  const blob = new Blob([JSON.stringify(latestResult, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'analysis-result.json';
  a.click();
  URL.revokeObjectURL(url);
});

function renderResult(r) {
  resultEl.classList.remove('hidden');
  document.getElementById('duration').textContent = `${r.durationSec}초`;
  document.getElementById('bpm').textContent = String(r.bpm);
  document.getElementById('key').textContent = r.key;
  document.getElementById('chords').textContent = r.chords.join(' | ');
  document.getElementById('melody').textContent = r.melody.join(', ');
}

function estimateBpm(signal, sampleRate) {
  const hop = 1024;
  const env = [];
  for (let i = 0; i + hop < signal.length; i += hop) {
    let e = 0;
    for (let j = 0; j < hop; j++) e += Math.abs(signal[i + j]);
    env.push(e / hop);
  }

  const minBpm = 70, maxBpm = 180;
  const minLag = Math.floor((60 / maxBpm) * sampleRate / hop);
  const maxLag = Math.floor((60 / minBpm) * sampleRate / hop);

  let bestLag = minLag, bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let i = 0; i + lag < env.length; i++) score += env[i] * env[i + lag];
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  const bpm = Math.round(60 / (bestLag * hop / sampleRate));
  return Number.isFinite(bpm) ? bpm : 120;
}

function estimateChroma(signal, sampleRate) {
  const chroma = new Array(12).fill(0);
  const win = 4096;
  const hop = 2048;

  for (let i = 0; i + win < signal.length; i += hop) {
    const frame = signal.slice(i, i + win);
    const f = dominantFrequency(frame, sampleRate);
    if (f < 50 || f > 2000) continue;
    const midi = 69 + 12 * Math.log2(f / 440);
    const pc = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pc] += 1;
  }
  return chroma;
}

function estimateKey(chroma) {
  const names = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const majorTpl = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];

  let best = { idx: 0, score: -Infinity };
  for (let root = 0; root < 12; root++) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += chroma[i] * majorTpl[(i - root + 12) % 12];
    if (s > best.score) best = { idx: root, score: s };
  }
  return `${names[best.idx]} major`;
}

function estimateSimpleChords(key, bars) {
  const k = key.split(' ')[0];
  const progressions = {
    'C': ['C','G','Am','F'],
    'G': ['G','D','Em','C'],
    'D': ['D','A','Bm','G'],
    'A': ['A','E','F#m','D'],
    'E': ['E','B','C#m','A'],
    'F': ['F','C','Dm','Bb']
  };
  const p = progressions[k] || [k, `${k}5`, `${k}m`, 'F'];
  return Array.from({ length: bars }, (_, i) => p[i % p.length]);
}

function estimateMelodyNotes(signal, sampleRate, maxCount) {
  const notes = [];
  const win = 4096;
  const hop = Math.floor(sampleRate * 0.25);
  for (let i = 0; i + win < signal.length && notes.length < maxCount; i += hop) {
    const frame = signal.slice(i, i + win);
    const f = dominantFrequency(frame, sampleRate);
    if (f < 80 || f > 1200) continue;
    notes.push(freqToNote(f));
  }
  return notes.length ? notes : ['(멜로디 검출 약함)'];
}

function dominantFrequency(frame, sampleRate) {
  const N = frame.length;
  let bestK = 1;
  let bestMag = 0;
  const maxK = Math.min(300, Math.floor(N / 2));
  for (let k = 1; k < maxK; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n += 4) {
      const a = 2 * Math.PI * k * n / N;
      re += frame[n] * Math.cos(a);
      im -= frame[n] * Math.sin(a);
    }
    const mag = re * re + im * im;
    if (mag > bestMag) {
      bestMag = mag;
      bestK = k;
    }
  }
  return (bestK * sampleRate) / N;
}

function freqToNote(freq) {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const name = noteNames[(midi + 1200) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

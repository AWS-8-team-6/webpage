import React, { useState } from 'react';
import './App.css';

const baseUrl = process.env.REACT_APP_API_GATEWAY_BASE;
const executeApi = `${baseUrl}/execute`;
const resultApi = `${baseUrl}/result`;
const presignApi = `${baseUrl}/presign`;

const generateUUID = () => {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11)
    .replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
};

function App() {
  const [yamlInput, setYamlInput] = useState('');
  const [rawData, setRawData] = useState('');
  const [useDefaultPrompt, setUseDefaultPrompt] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [suggestedYaml, setSuggestedYaml] = useState('');
  const [isPolling, setIsPolling] = useState(false);

  const getPresignedUrl = async (fileName) => {
    const res = await fetch(presignApi, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: fileName })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`presign 요청 실패: ${res.status}, ${text}`);
    }

    return await res.json();
  };

  const uploadToS3 = async (url, content) => {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: new Blob([content], { type: 'application/json' })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`S3 업로드 실패: ${res.status}, ${text}`);
    }
  };

  const handleSubmit = async () => {
    const userPromptLines = [];

    if (useCustomPrompt && customPrompt.trim() !== '') {
      userPromptLines.push(customPrompt);
    }

    try {
      setSuggestedYaml('파일 업로드 및 Step Functions 실행 중...');

      const now = new Date();
      const pad = (n) => n.toString().padStart(2, '0');
      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
      const uuid = generateUUID();
      const fileName = `${dateStr}-${uuid}.txt`;

      const { uploadUrl, key } = await getPresignedUrl(fileName);
      await uploadToS3(uploadUrl, rawData); // ✅ rawData만 S3에 저장

      const payload = {
        yamlOrigin: yamlInput,
        rawData: key,
        defaultPrompt: useDefaultPrompt ? '이 데이터는 타임스탬프, CPU 사용률, 메모리 사용률로 구성되어 있어.' : '',
        userPrompt: userPromptLines.join('\n'),
      };

      const response = await fetch(executeApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`서버 응답 오류: ${response.status}, ${text}`);
      }

      const result = await response.json();
      const executionArn = result.executionArn;

      if (!executionArn) {
        setSuggestedYaml('executionArn을 받지 못했습니다.');
        return;
      }

      setIsPolling(true);
      const intervalId = setInterval(async () => {
        try {
          const pollUrl = `${resultApi}?executionArn=${encodeURIComponent(executionArn)}`;
          const pollResponse = await fetch(pollUrl);

          if (!pollResponse.ok) {
            const errText = await pollResponse.text();
            throw new Error(`결과 API 응답 오류: ${pollResponse.status}, ${errText}`);
          }

          const pollResult = await pollResponse.json();

          if (pollResult.status === 'SUCCEEDED') {
            clearInterval(intervalId);
            setIsPolling(false);

            const raw = pollResult.result?.Payload?.body;
            const firstParsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

            const finalYaml = typeof firstParsed?.finalYaml === 'string' &&
              firstParsed.finalYaml.trim().startsWith('{')
              ? JSON.parse(firstParsed.finalYaml)
              : firstParsed.finalYaml;

            const output = typeof finalYaml === 'string'
              ? finalYaml
              : JSON.stringify(finalYaml, null, 2);

            setSuggestedYaml(output);
          } else if (pollResult.status === 'FAILED') {
            clearInterval(intervalId);
            setIsPolling(false);
            setSuggestedYaml(`에러 발생: ${pollResult.error || '원인 불명'}`);
          }
        } catch (e) {
          clearInterval(intervalId);
          setIsPolling(false);
          setSuggestedYaml('Polling 중 오류 발생: ' + e.message);
        }
      }, 3000);
    } catch (err) {
      setSuggestedYaml('에러 발생: ' + err.message);
    }
  };

  const sectionStyle = {
    backgroundColor: '#f8f9fa',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1.5rem',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
  };

  return (
    <div className="App" style={{ padding: '2rem', maxWidth: '800px', margin: 'auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ marginBottom: '2rem' }}>Kostai - AI 기반 쿠버네티스 비용 최적화 도우미</h2>

      <div style={sectionStyle}>
        <h4>1. YAML 파일 원본</h4>
        <textarea
          rows={6}
          placeholder="Deployment YAML 입력"
          value={yamlInput}
          onChange={(e) => setYamlInput(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      <div style={sectionStyle}>
        <h4>2. Kubecost raw data 입력</h4>
        <textarea
          rows={6}
          placeholder="kubecost raw data 입력"
          value={rawData}
          onChange={(e) => setRawData(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      <div style={sectionStyle}>
        <h4>3. 기본 프롬프트</h4>
        <label>
          <input
            type="checkbox"
            checked={useDefaultPrompt}
            onChange={(e) => setUseDefaultPrompt(e.target.checked)}
          />
          &nbsp;기본 프롬프트 적용
        </label>
      </div>

      <div style={sectionStyle}>
        <h4>4. 사용자 프롬프트 입력</h4>
        <label>
          <input
            type="checkbox"
            checked={useCustomPrompt}
            onChange={(e) => setUseCustomPrompt(e.target.checked)}
          />
          &nbsp;사용자 프롬프트 사용
        </label>
        <textarea
          rows={4}
          placeholder="추가적인 프롬프트 입력"
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          style={{ width: '100%', marginTop: '0.5rem' }}
        />
      </div>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <button className="kostai-button" onClick={handleSubmit} disabled={isPolling}>
          {isPolling ? '분석 중...' : '최적화 제안 받기'}
        </button>
      </div>

      <div style={sectionStyle}>
        <h4>Kostai가 제안하는 YAML</h4>
        <pre style={{
          background: '#f0f0f0',
          padding: '1rem',
          whiteSpace: 'pre-wrap',
          borderRadius: '6px',
          border: '1px solid #ccc'
        }}>
          {suggestedYaml}
        </pre>

        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <button className="kostai-button" style={{ marginRight: '1rem' }}>수락</button>
          <button className="kostai-button secondary">거절</button>
        </div>
      </div>
    </div>
  );
}

export default App;
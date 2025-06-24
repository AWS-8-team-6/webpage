import React, { useState } from 'react';
import './App.css';

const baseUrl = process.env.REACT_APP_API_GATEWAY_BASE;
const executeApi = `${baseUrl}/execute`;
const resultApi = `${baseUrl}/result`;
const presignApi = `${baseUrl}/presign`;
const acceptApi = `${baseUrl}/accept`;

const generateUUID = () => {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11)
    .replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
};

function App() {
  // 기존 상태
  const [yamlInput, setYamlInput] = useState('');
  const [rawData, setRawData] = useState('');
  const [useDefaultPrompt, setUseDefaultPrompt] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [suggestedYaml, setSuggestedYaml] = useState('');
  const [isPolling, setIsPolling] = useState(false);
  const [yamlFileName, setYamlFileName] = useState('');
  const [yamlPath, setYamlPath] = useState('');

  // 새로 추가된 Kubecost API 생성기 상태
  const [isApiGeneratorOpen, setIsApiGeneratorOpen] = useState(false);
  const [kubecostBaseUrl, setKubecostBaseUrl] = useState('');
  const [apiType, setApiType] = useState('allocation'); // 'allocation' 또는 'assets'
  const [window, setWindow] = useState('1d');
  const [excludedNamespaces, setExcludedNamespaces] = useState({
    kubecost: true,
    argocd: true,
    'kube-system': true,
  });
  const [generatedApiUrl, setGeneratedApiUrl] = useState('');


  // --- 기존 함수들 ---
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
      await uploadToS3(uploadUrl, rawData);

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

  const handleAccept = async () => {
    try {
      const payload = {
        yamlRecommended: suggestedYaml,
        yamlFileName,
        yamlPath
      };

      const res = await fetch(acceptApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`수락 요청 실패: ${res.status}, ${text}`);
      }

      alert('CD 트리거 요청 성공!');
    } catch (err) {
      alert(`에러: ${err.message}`);
    }
  };

  // --- 새로 추가된 함수들 ---
  const handleGenerateApiUrl = () => {
    if (!kubecostBaseUrl) {
      alert('Kubecost 웹 접속 링크를 입력해주세요.');
      return;
    }

    let url = `${kubecostBaseUrl}:9003/`;
    let params = new URLSearchParams();

    if (apiType === 'allocation') {
      url += 'allocation';
      params.append('window', window);
      params.append('aggregate', 'pod');
      
      const toExclude = Object.entries(excludedNamespaces)
        .filter(([_, checked]) => checked)
        .map(([name]) => `"${name}"`)
        .join(',');

      if (toExclude) {
        params.append('filter', `namespace!:${toExclude}`);
      }
    } else { // assets
      url += 'assets';
      params.append('window', window);
      params.append('filter', 'category:"Compute"');
    }

    setGeneratedApiUrl(`${url}?${params.toString()}`);
  };

  const handleCopyUrl = () => {
    if (generatedApiUrl) {
      navigator.clipboard.writeText(generatedApiUrl)
        .then(() => alert('API URL이 클립보드에 복사되었습니다.'))
        .catch(err => alert('복사 실패: ' + err));
    }
  };

  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setExcludedNamespaces(prev => ({ ...prev, [name]: checked }));
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

      {/* ================================================================== */}
      {/* ======================= 새로 추가된 토글 섹션 ======================= */}
      {/* ================================================================== */}
      <div style={sectionStyle}>
        <button 
          onClick={() => setIsApiGeneratorOpen(!isApiGeneratorOpen)}
          style={{ all: 'unset', cursor: 'pointer', fontWeight: 'bold', color: '#007bff', marginBottom: isApiGeneratorOpen ? '1rem' : '0' }}
        >
          <h4>{isApiGeneratorOpen ? '▼ Kubecost API URL 생성기 닫기' : '► Kubecost API URL 생성기 열기'}</h4>
        </button>

        {isApiGeneratorOpen && (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <label>Kubecost 웹 접속 링크</label>
              <input
                type="text"
                placeholder="http://<your-kubecost-address>"
                value={kubecostBaseUrl}
                onChange={(e) => setKubecostBaseUrl(e.target.value)}
                style={{ width: '100%', marginTop: '0.5rem' }}
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}></label>
              <label style={{ marginRight: '1rem' }}>
                <input type="radio" value="allocation" checked={apiType === 'allocation'} onChange={() => setApiType('allocation')} /> Pod 중심
              </label>
              <label>
                <input type="radio" value="assets" checked={apiType === 'assets'} onChange={() => setApiType('assets')} /> Node 중심
              </label>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label>데이터 기간 (예: 1h, 6h, 24h, 1d, 7d, 30d ···)</label>
              <input
                type="text"
                value={window}
                onChange={(e) => setWindow(e.target.value)}
                style={{ width: '100%', marginTop: '0.5rem' }}
              />
            </div>
            
            {apiType === 'allocation' && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>제외할 네임스페이스 (권장)</label>
                {Object.keys(excludedNamespaces).map(ns => (
                  <label key={ns} style={{ marginRight: '1rem' }}>
                    <input
                      type="checkbox"
                      name={ns}
                      checked={excludedNamespaces[ns]}
                      onChange={handleCheckboxChange}
                    /> {ns}
                  </label>
                ))}
              </div>
            )}

            <button className="kostai-button" onClick={handleGenerateApiUrl}>URL 생성</button>
            
            {generatedApiUrl && (
              <div style={{ marginTop: '1rem' }}>
                <pre style={{ background: '#e9ecef', padding: '0.5rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all', borderRadius: '6px' }}>
                  {generatedApiUrl}
                </pre>
                <button className="kostai-button secondary" style={{marginTop: '0.5rem'}} onClick={handleCopyUrl}>복사</button>
              </div>
            )}
          </div>
        )}
      </div>
      {/* ================================================================== */}
      {/* ========================= 추가된 섹션 끝 ========================== */}
      {/* ================================================================== */}

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

        <input
          type="text"
          placeholder="파일 이름 (예: travel_control.yaml)"
          value={yamlFileName}
          onChange={(e) => setYamlFileName(e.target.value)}
          style={{ width: '100%', marginBottom: '0.5rem' }}
        />
        <input
          type="text"
          placeholder="저장 경로 (예: test)"
          value={yamlPath}
          onChange={(e) => setYamlPath(e.target.value)}
          style={{ width: '100%', marginBottom: '1rem' }}
        />

        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <button className="kostai-button" style={{ marginRight: '1rem' }} onClick={handleAccept}>수락</button>
          <button className="kostai-button secondary">거절</button>
        </div>
      </div>
    </div>
  );
}

export default App;
import React, { useState } from 'react';
import './App.css';

function App() {
  const [yamlInput, setYamlInput] = useState('');
  const [rawData, setRawData] = useState('');
  const [useDefaultPrompt, setUseDefaultPrompt] = useState(true);
  const [customPrompt, setCustomPrompt] = useState('');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [optimizeNote, setOptimizeNote] = useState('');
  const [suggestedYaml, setSuggestedYaml] = useState('');

  const handleSubmit = async () => {
    const promptText = [];

    if (useDefaultPrompt) {
      promptText.push(
        '이 데이터는 타임스탬프, CPU 사용률, 메모리 사용률로 구성되어 있어.',
        '결과는 쿠버네티스 Deployment YAML 형식으로 반환해줘.'
      );
    }
    if (useCustomPrompt && customPrompt.trim() !== '') {
      promptText.push(customPrompt);
    }

    const response = await fetch('https://your-api-gateway-url/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        yaml: yamlInput,
        rawData,
        prompt: promptText.join('\n'),
        notes: optimizeNote
      }),
    });
    const result = await response.json();
    setSuggestedYaml(result.optimizedYaml || '결과 없음');
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

        <div style={{ fontSize: '0.9rem', color: '#555' }}>
          <div style={{
            backgroundColor: '#f0f4f8',
            border: '1px solid #ccc',
            borderRadius: '6px',
            padding: '0.75rem',
            marginTop: '0.5rem',
            marginBottom: '0.5rem'
          }}>
            <strong>데이터 스키마 정의:</strong> "이 데이터는 타임스탬프, CPU 사용률, 메모리 사용률로 구성되어 있어."<br />
            <strong>결과 포맷 지정:</strong> "결과는 쿠버네티스 Deployment YAML 형식으로 반환해줘."
          </div>
          이러한 기본 프롬프트가 적용되고 있습니다.<br />
          추가적으로 원하는 사항이 있으면 4번 사용자 프롬프트 입력창에 입력해주세요.
        </div>
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

      <div style={sectionStyle}>
        <h4>5. Kubecost 최적화 제안 사항 입력</h4>
        <textarea
          rows={4}
          placeholder="Kubecost API로 받은 리소스 최적화 권장 사항을 여기에 붙여넣으세요."
          value={optimizeNote}
          onChange={(e) => setOptimizeNote(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <button className="kostai-button" onClick={handleSubmit}>최적화 제안 받기</button>
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

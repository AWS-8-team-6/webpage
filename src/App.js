import React, { useState } from 'react';
import './App.css';

function App() {
  const [rawData, setRawData] = useState('');
  const [yamlData, setYamlData] = useState('');
  const [repoLink, setRepoLink] = useState('');
  const [filePath, setFilePath] = useState('');
  const [suggestedYaml, setSuggestedYaml] = useState('');

  const handleSubmit = async () => {
    // 실제 API Gateway 주소로 변경 필요
    const response = await fetch('https://your-api-gateway-url/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawData,
        yamlData,
        repoLink,
        filePath,
      }),
    });
    const result = await response.json();
    setSuggestedYaml(result.optimizedYaml || '결과 없음');
  };

  return (
    <div className="App">
      <h1>Kostai 테스트 웹</h1>

      <textarea
        placeholder="raw data 입력"
        rows={8}
        value={rawData}
        onChange={(e) => setRawData(e.target.value)}
      /><br />

      <textarea
        placeholder="원본 YAML 파일 입력"
        rows={8}
        value={yamlData}
        onChange={(e) => setYamlData(e.target.value)}
      /><br />

      <input
        type="text"
        placeholder="GitHub 레포지토리 링크"
        value={repoLink}
        onChange={(e) => setRepoLink(e.target.value)}
      /><br />

      <input
        type="text"
        placeholder="YAML 파일 경로"
        value={filePath}
        onChange={(e) => setFilePath(e.target.value)}
      /><br />

      <button onClick={handleSubmit}>최적화 제안 받기</button>

      <h3>AI가 제안한 YAML:</h3>
      <pre>{suggestedYaml}</pre>

      <button>수락</button>
      <button>거절</button>
    </div>
  );
}

export default App;

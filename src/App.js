import React, { useState, useEffect } from "react";
import "./App.css";
import InfoIcon from "./InfoIcon"; 

const baseUrl = process.env.REACT_APP_API_GATEWAY_BASE;
const executeApi = `${baseUrl}/execute`;
const resultApi = `${baseUrl}/result`;
const presignApi = `${baseUrl}/presign`;
const acceptApi = `${baseUrl}/accept`;

const generateUUID = () => {
	return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
		(
			c ^
			(crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
		).toString(16)
	);
};

// 화면이 재렌더링 되어도 재선언되지 않도록 외부에 선언합니다.
const loadingMessages = [
	"YAML이 커피 한 잔 마시며 재충전 중...",
	"AI가 숨은 주석의 비밀을 해독하는 중...",
	"들여쓰기 마법사 찾아다니는 중...",
	"파업한 AI 찾는 중...",
	"주석 좀 제대로 쓰세요...",
	"AI가 스크롤 바와 한판 승부 중...",
	"YAML에 예술적 감성 불어넣는 중...",
	"코드 건강 검진 실시하는 중...",
	"AI에게 커피 전달하는 중…",
	"yaml 파일을 0과 1로 분해 중…",
	"과로한 AI를 다른 AI로 교체하는 중…",
	"3…2…1… YAML 발사!",
	"YAML 코드가 나타나기 전에 마지막으로 꽃단장 하는 중…",
	"YAML에 버그 숨겨두는 중…",
	"커피 한 잔의 여유를 아는 AI 호출하는 중…",
	"인간세상을 지배할 원대한 계획을 세우는 중…",
	"1010111001101001010101101001…",
	"사람을 화나게 하는 방법은 두 가지가 있는데, 첫째로는 말을 끝까지 안하는거고…",
	"인간은 절대 알 수 없는 방법을 사용하는 중…",
	"혹시 그거 아시나요? 그건 바로..!",
	"AIAMLAIAMLAIAMLAIAMLAIAMLAIAML",
	"피 같은 회사 돈 최적화 하는 중..",
	"비용 줄여서 칭찬받는 상상 하는 중…",
	"연봉 협상에서 우위를 점하는 상상 하는 중…",
	"우리만 알고 있는 k8s 최적화 , 알려 줄까?",
];

function App() {
	// 기존 상태
	const [yamlInput, setYamlInput] = useState("");
	const [rawData, setRawData] = useState("");
	const [useDefaultPrompt, setUseDefaultPrompt] = useState(true);
	const [customPrompt, setCustomPrompt] = useState("");
	const [useCustomPrompt, setUseCustomPrompt] = useState(false);
	const [suggestedYaml, setSuggestedYaml] = useState("");
	const [isPolling, setIsPolling] = useState(false);
	const [yamlFileName, setYamlFileName] = useState("");
	const [yamlPath, setYamlPath] = useState("");
	const [loadingPhase, setLoadingPhase] = useState(null);
	const [isApiGeneratorOpen, setIsApiGeneratorOpen] = useState(false);
	const [kubecostBaseUrl, setKubecostBaseUrl] = useState("");
	const [apiType, setApiType] = useState("allocation"); // 'allocation' 또는 'assets'
	const [windowParam, setWindowParam] = useState("1d");
	const [excludedNamespaces, setExcludedNamespaces] = useState({
		kubecost: true,
		argocd: true,
		"kube-system": true,
	});
	const [generatedApiUrl, setGeneratedApiUrl] = useState("");
	const [loadingMessage, setLoadingMessage] = useState("");
	const [comparisonReport, setComparisonReport] = useState("");
	const [copySuccess, setCopySuccess] = useState("");

	// isPolling 상태가 변경될 때마다 이펙트를 실행합니다.
	useEffect(() => {
		let messageInterval;

		if (isPolling) {
			// isPolling이 true가 되면(분석 시작), 8초마다 메시지를 변경하는 인터벌을 설정합니다.
			let currentIndex = 0;
			setLoadingMessage(loadingMessages[currentIndex]); // 즉시 첫 메시지 표시

			messageInterval = setInterval(() => {
				currentIndex = (currentIndex + 1) % loadingMessages.length; // 다음 인덱스로 순환
				setLoadingMessage(loadingMessages[currentIndex]);
			}, 6000); // 6초
		}

		// 컴포넌트가 언마운트되거나 isPolling이 false로 바뀌면 인터벌을 정리합니다.
		return () => {
			clearInterval(messageInterval);
		};
	}, [isPolling]); // isPolling 값이 바뀔 때만 이 함수를 실행

	// --- 기존 함수들 ---
	const getPresignedUrl = async (fileName) => {
		const res = await fetch(presignApi, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ filename: fileName }),
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`presign 요청 실패: ${res.status}, ${text}`);
		}

		return await res.json();
	};

	const uploadToS3 = async (url, content) => {
		const res = await fetch(url, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: new Blob([content], { type: "application/json" }),
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`S3 업로드 실패: ${res.status}, ${text}`);
		}
	};

	const handleSubmit = async () => {
		setComparisonReport("");
		const userPromptLines = [];
		if (useCustomPrompt && customPrompt.trim()) {
			userPromptLines.push(customPrompt.trim());
		}

		try {
			setLoadingPhase("requesting");
			setSuggestedYaml("파일 업로드 및 Step Functions 실행 중...");
			setYamlInput(yamlInput);

			const now = new Date();
			const pad = (n) => n.toString().padStart(2, "0");
			const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
				now.getDate()
			)}-${pad(now.getHours())}${pad(now.getMinutes())}`;
			const uuid = generateUUID();
			const fileName = `${dateStr}-${uuid}.txt`;

			// S3 upload
			const { uploadUrl, key } = await getPresignedUrl(fileName);
			await uploadToS3(uploadUrl, rawData);

			const payload = {
				yamlOrigin: yamlInput,
				rawData: key,
				defaultPrompt: useDefaultPrompt
					? `### Do
- **반드시** 구체적이고, 자세하며, 정확할 것.
- 사용자가 제공한 데이터를 바탕으로, 비용을 줄일 수 있는 최적화 방안을 제시할 것.
- 과다 리소스, 과소 리소스를 구분하고 이에 맞춰 리소스를 조정할 것.

### Don’t
- **절대** 메타 문구(meta-phrases)를 사용하지 말 것 (ex. “알겠습니다.”, “안녕하세요”, “확인했습니다.”)
- 과다 리소스의 경우를 제외하고, 최적화를 위해 성능을 희생하지 말 것.
- 최적화, 효율화에 영향을 주는 요소 외의 요소를 수정하지 말 것.
`
					: "",
				userPrompt: userPromptLines.join("\n"),
			};

			const execRes = await fetch(executeApi, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!execRes.ok) {
				const text = await execRes.text();
				throw new Error(`서버 응답 오류: ${execRes.status}, ${text}`);
			}
			const { executionArn } = await execRes.json();

			if (!executionArn) {
				setSuggestedYaml("executionArn을 받지 못했습니다.");
				setLoadingPhase(null);
				return;
			}

			setLoadingPhase("polling");
			setIsPolling(true);

			// Polling 로직은 isPolling이 true인 동안 계속 실행됨
			const intervalId = setInterval(async () => {
				try {
					const pollRes = await fetch(
						`${resultApi}?executionArn=${encodeURIComponent(executionArn)}`
					);
					if (!pollRes.ok) {
						const errT = await pollRes.text();
						throw new Error(`결과 API 오류: ${pollRes.status}, ${errT}`);
					}

					const pollResult = await pollRes.json();

					if (pollResult.status === "SUCCEEDED") {
						clearInterval(intervalId);
						setLoadingPhase(null);
						setIsPolling(false);

						const raw = pollResult.result?.Payload?.body;
						const firstParsed = typeof raw === "string" ? JSON.parse(raw) : raw;
						const finalYaml =
							typeof firstParsed?.finalYaml === "string" &&
							firstParsed.finalYaml.trim().startsWith("{")
								? JSON.parse(firstParsed.finalYaml)
								: firstParsed.finalYaml;
						setSuggestedYaml(
							typeof finalYaml === "string"
								? finalYaml
								: JSON.stringify(finalYaml, null, 2)
						);

						setComparisonReport(
							typeof pollResult.report === "string"
								? pollResult.report
								: pollResult.report
								? JSON.stringify(pollResult.report, null, 2)
								: ""
						);
					} else if (pollResult.status === "FAILED") {
						clearInterval(intervalId);
						setLoadingPhase(null);
						setIsPolling(false);
						setSuggestedYaml(`에러 발생: ${pollResult.error || "원인 불명"}`);
					}
				} catch (e) {
					clearInterval(intervalId);
					setLoadingPhase(null);
					setIsPolling(false);
					setSuggestedYaml("Polling 중 오류 발생: " + e.message);
				}
			}, 3000);
		} catch (err) {
			setSuggestedYaml("에러 발생: " + err.message);
			setIsPolling(null);
		}
	};

	const handleAccept = async () => {
		try {
			const payload = {
				yamlRecommended: suggestedYaml,
				yamlFileName,
				yamlPath,
			};

			const res = await fetch(acceptApi, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const text = await res.text();
				throw new Error(`수락 요청 실패: ${res.status}, ${text}`);
			}

			alert("Github push 완료! Github repository 혹은 argoCD를 확인해보세요.");
		} catch (err) {
			alert(`에러: ${err.message}`);
		}
	};

	const handleGenerateApiUrl = () => {
		if (!kubecostBaseUrl) {
			alert("Kubecost Endpoint를 입력해주세요.");
			return;
		}

		let url = `${kubecostBaseUrl}:9003/`;
		let params = new URLSearchParams();

		if (apiType === "allocation") {
			url += "allocation";

			params.append("window", windowParam);
			params.append("aggregate", "pod");

			const toExclude = Object.entries(excludedNamespaces)
				.filter(([_, checked]) => checked)
				.map(([name]) => `"${name}"`)
				.join(",");

			if (toExclude) {
				params.append("filter", `namespace!:${toExclude}`);
			}
		} else {
			// assets
			url += "assets";

			params.append("window", windowParam);
			params.append("filter", 'category:"Compute"');
		}

		setGeneratedApiUrl(`${url}?${params.toString()}`);
	};

	const handleReject = () => {
		const message =
			"입력한 모든 내용이 사라집니다.\n" +
			"만약 추천을 다시 받고싶으신 경우,\n" +
			"화면 상단의 '최적화 제안 받기' 버튼을 다시 누르시면 됩니다.\n" +
			"입력 내용을 초기화하시겠습니까?";
		if (window.confirm(message)) {
			window.location.reload();
		}
	};

	const handleCopyUrl = () => {
		if (!generatedApiUrl) return;
		navigator.clipboard
			.writeText(generatedApiUrl)
			.then(() => {
				setCopySuccess("복사 완료!");
				setTimeout(() => setCopySuccess(""), 2000);
			})
			.catch(() => {
				setCopySuccess("복사 실패");
				setTimeout(() => setCopySuccess(""), 2000);
			});
	};

	const handleCheckboxChange = (e) => {
		const { name, checked } = e.target;
		setExcludedNamespaces((prev) => ({ ...prev, [name]: checked }));
	};

	const sectionStyle = {
		backgroundColor: "#f8f9fa",
		border: "1px solid #ddd",
		borderRadius: "8px",
		padding: "1rem",
		marginBottom: "1.5rem",
		boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
	};

	return (
		<div
			className="App"
			style={{
				padding: "2rem",
				maxWidth: "800px",
				margin: "auto",
				fontFamily: "sans-serif",
			}}
		>
			<h2 style={{ marginBottom: "2rem" }}>KostAI</h2>

			<div className="form-section">
				<div style={{ display: 'flex', alignItems: 'baseline' }}>
					<h4 className="section-title">1. 최적화를 진행할 파일 내용</h4>
					<InfoIcon text="최적화를 진행할 Kubernetes yaml, Karpenter nodepool, Terraform 등의 파일 내부 텍스트를 입력해주세요." />
				</div>
				<div className="input-card">
					<textarea
						rows={6}
						placeholder="Deployment YAML 입력"
						value={yamlInput}
						onChange={(e) => setYamlInput(e.target.value)}
						style={{ width: "100%" }}
					/>
				</div>
			</div>

			<div className="form-section">
				<button
					onClick={() => setIsApiGeneratorOpen(!isApiGeneratorOpen)}
					style={{
						all: "unset",
						cursor: "pointer",
						// fontWeight: "bold",
					}}
				>
					{/* <h4>
						{isApiGeneratorOpen
							? "▼ Kubecost API URL 생성기"
							: "▶ Kubecost API URL 생성기"}
					</h4> */}

					<div style={{ display: 'flex', alignItems: 'baseline' }}>
						<h4>
							{isApiGeneratorOpen
								? "▼ Kubecost API URL 생성기"
								: "▶ Kubecost API URL 생성기"}
						</h4>
						<InfoIcon text="Kubecost가 설치되어있지 않은 경우, 아래 링크를 참고하여 Kubecost를 설치해주세요. \n Kubecost가 설치되어있는 경우, API URL 생성기를 통해 생성한 URL을 새로운 브라우저 탭에 붙여넣어주세요. 이를 통해 추출된 raw data 전부를 복사하여 하단의 '2. Kubecost raw data' 탭에 입력해 주세요." />
					</div>
				</button>

				<div
					className={`api-collapse-wrapper ${
						isApiGeneratorOpen ? "api-collapse-open" : ""
					}`}
				>
					<div className="input-card">
						<div style={{ marginBottom: "1rem" }}>
							<h4 className="section-title">만약 kubecost가 처음이시라면:</h4>
							<label>
								<a
									href="https://docs.aws.amazon.com/ko_kr/eks/latest/userguide/cost-monitoring-kubecost.html"
									target="_blank"
									rel="noopener noreferrer"
								>
									Kubecost 설치 및 대시보드 액세스
								</a>
							</label>
						</div>
						<div style={{ marginBottom: "1rem" }}>
							<h4 className="section-title">Kubecost endpoint</h4>
							<input
								type="text"
								placeholder="http://<your-kubecost-address>"
								value={kubecostBaseUrl}
								onChange={(e) => setKubecostBaseUrl(e.target.value)}
								style={{ width: "100%", marginTop: "0.5rem" }}
							/>
						</div>

						<div style={{ marginBottom: "1rem" }}>
							<label
								style={{ display: "block", marginBottom: "0.5rem" }}
							></label>
							<label style={{ marginRight: "1rem" }}>
								<input
									type="radio"
									value="allocation"
									checked={apiType === "allocation"}
									onChange={() => setApiType("allocation")}
								/>
								Pod 중심
							</label>
							<label>
								<input
									type="radio"
									value="assets"
									checked={apiType === "assets"}
									onChange={() => setApiType("assets")}
								/>
								Node 중심
							</label>
						</div>

						<div style={{ marginBottom: "1rem" }}>
							<h4 className="section-title" style={{ marginBottom: "1rem" }}>
								기간
							</h4>
							<div />
							<label style={{ marginBottom: "0.3rem" }}>
								- 숫자 뒤에 m(분), h(시), d(일)을 붙여주세요.
							</label>
							<div />
							<label style={{ marginBottom: "0.3rem" }}>
								- kubecost 무료 버전의 경우 최소 1m, 최대 15d까지 가능합니다.
							</label>
							<input
								type="text"
								value={windowParam}
								onChange={(e) => setWindowParam(e.target.value)}
								style={{ width: "100%", marginTop: "0.5rem" }}
							/>
						</div>

						{apiType === "allocation" && (
							<div className="checkbox-section">
								<label className="block-label">
									제외할 네임스페이스 (권장)
								</label>
								<div className="checkbox-group">
									{Object.keys(excludedNamespaces).map((ns) => (
										<label key={ns} style={{ marginRight: "1rem" }}>
											<input
												type="checkbox"
												name={ns}
												checked={excludedNamespaces[ns]}
												onChange={handleCheckboxChange}
											/>{" "}
											{ns}
										</label>
									))}
								</div>
							</div>
						)}

						<button className="kostai-button" onClick={handleGenerateApiUrl}>
							URL 생성
						</button>

						{generatedApiUrl && (
							<div style={{ marginTop: "1rem" }}>
								<pre
									style={{
										background: "#e9ecef",
										padding: "0.5rem",
										whiteSpace: "pre-wrap",
										wordBreak: "break-all",
										borderRadius: "6px",
									}}
								>
									{generatedApiUrl}
								</pre>
								<button
									className="kostai-button secondary"
									style={{ marginTop: "0.5rem" }}
									onClick={handleCopyUrl}
								>
									복사
								</button>
								{copySuccess && (
									<div
										style={{
											fontSize: "0.9rem",
											color: "#28a745",
											marginTop: "0.3rem",
										}}
									>
										{copySuccess}
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="form-section">
				<div style={{ display: 'flex', alignItems: 'baseline' }}>
					<h4 className="section-title">2. Kubecost raw data</h4>
					<InfoIcon text="Kubecost api를 통해 추출한 raw data를 복사 후 붙여 넣어주세요. Kubecost 설치, Kubecost api 활용에 대한 도움이 필요하실 경우 상단의 'Kubecost API URL 생성기' 탭을 확인해주세요." />
				</div>
				<div className="input-card">
					<textarea
						rows={6}
						placeholder="kubecost raw data 입력"
						value={rawData}
						onChange={(e) => setRawData(e.target.value)}
						style={{ width: "100%" }}
					/>
				</div>
			</div>

			<div className="form-section">
				<div style={{ display: 'flex', alignItems: 'baseline' }}>
					<h4 className="section-title">3. 프롬프트</h4>
					<InfoIcon text="기본 프롬프트는 일반적인 리소스 최적화 기준을 포함하며, 필요 시 사용자 정의 프롬프트를 추가 입력해주세요." />
				</div>
				<div className="input-card">
					{/* 기본 프롬프트 */}
					<label>
						<input
							type="checkbox"
							checked={useDefaultPrompt}
							onChange={(e) => setUseDefaultPrompt(e.target.checked)}
						/>
						&nbsp;기본 프롬프트 적용
					</label>

					<pre className={`prompt-text ${useDefaultPrompt ? "" : "disabled"}`}>
						{`### Do
- **반드시** 구체적이고, 자세하며, 정확할 것.
- 사용자가 제공한 데이터를 바탕으로, 비용을 줄일 수 있는 최적화 방안을 제시할 것.
- 과다 리소스, 과소 리소스를 구분하고 이에 맞춰 리소스를 조정할 것.

### Don’t
- **절대** 메타 문구(meta-phrases)를 사용하지 말 것 (ex. “알겠습니다.”, “안녕하세요”, “확인했습니다.”)
- 과다 리소스의 경우를 제외하고, 최적화를 위해 성능을 희생하지 말 것.
- 최적화, 효율화에 영향을 주는 요소 외의 요소를 수정하지 말 것.
`}
					</pre>
					<div style={{ marginTop: "0.5rem" }}>
						<label>
							<input
								type="checkbox"
								checked={useCustomPrompt}
								onChange={(e) => setUseCustomPrompt(e.target.checked)}
							/>
							&nbsp;사용자 프롬프트 사용
						</label>
					</div>

					{useCustomPrompt && (
						<textarea
							rows={4}
							placeholder="ex. mysql의 리소스는 건드리지 말고 최적화를 진행해주세요"
							value={customPrompt}
							onChange={(e) => setCustomPrompt(e.target.value)}
							style={{ width: "100%", marginTop: "0.5rem" }}
						/>
					)}
				</div>
			</div>

			<div style={{ textAlign: "center", marginBottom: "2rem" }}>
				<button
					className="kostai-button"
					onClick={handleSubmit}
					disabled={loadingPhase !== null}
				>
					{loadingPhase === "requesting"
						? "AI에게 요청 보내는 중..."
						: loadingPhase === "polling"
						? "분석 중..."
						: "최적화 제안 받기"}
				</button>

				{loadingPhase === "polling" && (
					<div style={{ marginTop: "1rem", fontWeight: "bold", color: "#333" }}>
						<p>{loadingMessage}</p>
					</div>
				)}
			</div>

			<div className="form-section">
				<div style={{ display: 'flex', alignItems: 'baseline' }}>
					<h4 className="section-title">4. 비교 리포트</h4>
					<InfoIcon text="원본 파일과 AI가 제안한 최종 파일을 비교하여, 어떤 리소스가 어떻게 변경되었는지를 \n 한눈에 보여줍니다." />
				</div>
				<div className="input-card">
					<textarea
						rows={6}
						readOnly
						placeholder="비교 리포트가 여기 표시됩니다."
						value={comparisonReport}
						style={{ width: "100%" }}
					/>
				</div>
			</div>

			<div className="compare-section" style={{ sectionStyle }}>
				<h4 className="section-title">비교하기</h4>
				<div style={{ display: "flex", gap: "1rem" }}>
					<div style={{ flex: 1 }}>
						<h4 style={{ marginBottom: "0.5rem" }}>입력된 파일</h4>
						<pre
							style={{
								background: "#f8f9fa",
								padding: "1rem",
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
								borderRadius: "6px",
								border: "1px solid #ccc",
								height: "500px",
								overflowY: "auto",
							}}
						>
							{yamlInput}
						</pre>
					</div>
					<div style={{ flex: 1 }}>
						<h4 style={{ marginBottom: "0.5rem" }}>Kostai가 제안한 파일</h4>
						<pre
							style={{
								background: "#f0f0f0",
								padding: "1rem",
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
								borderRadius: "6px",
								border: "1px solid #ccc",
								height: "500px",
								overflowY: "auto",
							}}
						>
							{suggestedYaml}
						</pre>
					</div>
				</div>
			</div>
			<div style={{ display: 'flex', alignItems: 'baseline' }}>
					<h4 className="section-title">Kostai가 제안한 파일 Github에 push하기</h4>
					<InfoIcon text="KostAI가 제안한 파일을 원하는 Github repository에 push할 수 있습니다. \n Github repository 이름과 경로, Github ID와 token을 입력하면 해당 파일을 찾아서 변경, push합니다." />
				</div>
			<input
				type="text"
				placeholder="Github에 저장되어 있는 파일 이름 (예: exam_file.yaml)"
				value={yamlFileName}
				onChange={(e) => setYamlFileName(e.target.value)}
				style={{ width: "100%", marginTop: "1rem", marginBottom: "0.5rem" }}
			/>
			<input
				type="text"
				placeholder="Github에 파일이 저장되어 있는 경로 (예: test/final)"
				value={yamlPath}
				onChange={(e) => setYamlPath(e.target.value)}
				style={{ width: "100%", marginBottom: "1rem" }}
			/>
			<div style={{ marginTop: "1rem", textAlign: "center" }}>
				<button
					className="kostai-button"
					style={{ marginRight: "1rem" }}
					onClick={handleAccept}
				>
					수락
				</button>
				<button className="kostai-button secondary" onClick={handleReject}>
					거절
				</button>
			</div>
		</div>
	);
}

export default App;

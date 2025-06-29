import './InfoIcon.css'; 

/**
 * 아이콘과 호버 시 나타나는 툴팁(말풍선)을 표시하는 컴포넌트
 * @param {object} props
 * @param {string} props.text - 툴팁에 표시될 설명 텍스트
 */
const InfoIcon = ({ text }) => {
  return (
    <div className="info-icon-container">
      <span className="info-icon">?</span>
      <p className="info-tooltip">{text.replaceAll('\\n', '\n')}</p>
    </div>
  );
};

export default InfoIcon;
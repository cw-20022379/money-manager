/**
 * SegmentTab — 세그먼트 컨트롤(탭) 버튼 하나.
 *
 * List(정기지출/계좌/카드)와 Flow(트리/관계도/캘린더/청구)가 똑같이 쓰던
 * 탭 버튼을 공통화했다. 스타일은 index.css의 .seg-item* 클래스가 담당.
 */
export function SegmentTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`seg-item ${active ? 'seg-item-active' : 'seg-item-inactive'}`}
    >
      {children}
    </button>
  );
}

-- 3.2 성별×연령 인터로킹 할당 및 3.1 표준직업분류 대분류 할당 세팅
insert into quota_cells (dimension, cell_key, label, target) values
('sexage', 'M_19_29', '남성 19~29세', 120),
('sexage', 'F_19_29', '여성 19~29세', 100),
('sexage', 'M_30_39', '남성 30~39세', 165),
('sexage', 'F_30_39', '여성 30~39세', 135),
('sexage', 'M_40_49', '남성 40~49세', 160),
('sexage', 'F_40_49', '여성 40~49세', 130),
('sexage', 'M_50_59', '남성 50~59세', 105),
('sexage', 'F_50_59', '여성 50~59세', 85),
('ksco', 'mgr', '관리자', 110),
('ksco', 'pro', '전문가 및 관련 종사자', 320),
('ksco', 'clerk', '사무 종사자', 270),
('ksco', 'service', '서비스 종사자', 110),
('ksco', 'sales', '판매 종사자', 100),
('ksco', 'craft', '기능원 및 기능 종사자', 40),
('ksco', 'machine', '장치·기계조작 및 조립 종사자', 30),
('ksco', 'labor', '단순노무 종사자', 20)
on conflict (dimension, cell_key) do update set
  label = excluded.label,
  target = excluded.target;

-- 테스트용 진입 토큰 1개 추가 (status='invited')
insert into respondents (panel_source, panel_id, access_token, status) values
('self', 'test-respondent-id', 'test-token-1234', 'invited')
on conflict (access_token) do nothing;

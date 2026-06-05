-- 로컬 개발용 시드 데이터
-- supabase db reset 시 자동 실행
--
-- 실제 사용자(auth.users)는 웹 회원가입으로 만든 뒤
-- 그 user_id를 가지고 supabase studio에서 직접 memberships에 추가하거나
-- 추후 별도 dev-tools 스크립트로 추가합니다.
--
-- 여기서는 가족 더미 1개만 미리 만들어 둡니다.

INSERT INTO families (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', '박씨네 (테스트)')
ON CONFLICT DO NOTHING;

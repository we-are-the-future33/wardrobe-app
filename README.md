# 오늘 뭐 입지 — 배포 가이드

## 1단계: GitHub에 올리기

1. https://github.com/new 에서 새 저장소 생성
   - 이름: `wardrobe-app`
   - Public or Private (아무거나)
   - README 체크 해제
   - Create repository 클릭

2. 저장소 페이지에서 "uploading an existing file" 클릭
3. 이 폴더 안 파일들을 모두 드래그 & 드롭
4. Commit changes 클릭

## 2단계: Vercel에 배포

1. https://vercel.com/new 접속
2. GitHub 저장소 `wardrobe-app` 선택
3. Import 클릭
4. Environment Variables 섹션에서 아래 두 개 추가:
   - `ANTHROPIC_API_KEY` = sk-ant-api03-...
   - `WEATHER_API_KEY` = c8e5f2b884d...
5. Deploy 클릭

## 3단계: 완료

배포 완료 후 `https://wardrobe-app-xxx.vercel.app` 형태의 URL이 생성됩니다.

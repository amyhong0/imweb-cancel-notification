# 아임웹 취소 접수 알림 (Chrome 확장 프로그램)

아임웹 쇼핑몰에서 **취소 접수**(승인 대기) 건이 발생하면 **데스크톱 알림**을 띄워, 관리자가 취소를 승인할 수 있도록 알려 주는 Chrome 확장 프로그램입니다.

---

## 설치 (3단계)

### 1단계: 확장 프로그램 받기

**방법 A – ZIP으로 받기 (git 없이)**  
1. [공개 저장소](https://github.com/amyhong0/imweb-cancel-notification) 페이지에서 **Code → Download ZIP** 클릭 (계정·로그인 불필요)  
2. ZIP 압축 해제  

**방법 B – clone (PC에 git 설치되어 있을 때)**  
```bash
git clone https://github.com/amyhong0/imweb-cancel-notification.git
```
→ 사용할 폴더: **`imweb-cancel-notification`**

### 2단계: Chrome에 로드 (한 번만)

1. Chrome 주소창에 **`chrome://extensions/`** 입력 후 엔터  
2. 오른쪽 위 **개발자 모드** 켜기  
3. **압축해제된 확장 프로그램을 로드합니다** 클릭  
4. **1단계에서 받은 폴더**(`imweb-cancel-notification`) 선택 → **폴더 선택** 클릭  


### 3단계: API 키 입력 (한 번만)

1. 확장 프로그램 **아이콘** 우클릭 → **옵션** (또는 `chrome://extensions/`에서 해당 확장의 **세부정보** → **확장 프로그램 옵션**)  
2. **API Key**, **API Secret** 입력 (아임웹 관리자 → 설정 → 개발자센터에서 발급)  
3. **저장** 클릭  
4. **연결 테스트**로 동작 확인  

→ 끝. 이후에는 백그라운드에서 자동으로 취소 접수 건을 확인합니다.

---

## 기능

- 아임웹 API로 주문·품목(prod-orders)을 주기적으로 조회
- **취소 접수**(claim_status: CANCEL_REQUEST) 건만 감지 — 이미 취소 완료된 건이 아님
- 새로 발생한 취소 접수 건마다 데스크톱 알림 표시 (주문번호, "관리자 페이지에서 승인해 주세요")
- 이미 알림을 보낸 건은 다시 알림하지 않음

## 사용 방법

- 설정 저장 후 백그라운드에서 자동으로 주기적으로 확인합니다.
- **취소 접수** 건이 새로 생기면 Windows/macOS 데스크톱 알림이 표시됩니다. 알림을 보고 아임웹 관리자에서 취소 승인을 진행하면 됩니다.
- 팝업에서 **마지막 확인 시각**을 볼 수 있습니다.

## 확인 간격

- **분**: 1~60분. **시간**: 1~168시간(7일). 기본 5분.
- 너무 짧게 하면 아임웹 API 제한에 걸릴 수 있으므로 5~10분 권장.

## 아임웹 API 참고

- [아임웹 개발자센터](https://developers.imweb.me)
- 주문 목록 API + **품목 주문(prod-orders)** API를 사용하며, 품목의 **claim_status가 CANCEL_REQUEST**(취소 접수)인 건만 필터해 알림합니다.

## 파일 구성

```
imweb-cancel-notification/
├── manifest.json
├── icon128.png
├── credentials.example.js   # API 키 입력용 템플릿 (복사 후 credentials.default.js 로 사용)
├── credentials.default.js   # 로컬 전용, .gitignore 대상 (GitHub에 미포함)
├── background.js
├── options.html, options.js
├── popup.html, popup.js
└── README.md
```

## 보안

- API Key/Secret은 **옵션 저장** 또는 **credentials.default.js**(로컬에만 둠)에서만 사용하며, `https://api.imweb.me` 호출에만 쓰입니다.
- `credentials.default.js`는 `.gitignore`에 포함되어 GitHub에 올라가지 않습니다.


---

## 문제 해결

- **알림이 안 뜨는 경우**: Chrome 설정에서 해당 사이트/확장 프로그램 알림이 허용되어 있는지 확인하세요. 설정 페이지의 **테스트 알림** 버튼으로 확인할 수 있습니다.
- **연결 테스트 실패**: API Key/Secret, 개발자센터에서 키 활성화 여부를 확인하세요.

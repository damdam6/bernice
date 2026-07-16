// /api/* 응답 실패를 나타내는 에러 타입. UnauthorizedError는 401 전용 서브클래스로,
// 소비 측(예: P2-5 로그인 게이트)이 instanceof로 다른 실패와 구분해 분기할 수 있게 한다.
// 401 응답 계약(`{"error":"unauthorized"}`)은 이슈 #42가 확정.
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export class UnauthorizedError extends ApiError {
  constructor() {
    super('unauthorized', 401)
    this.name = 'UnauthorizedError'
  }
}

import { cp, mkdir, rm } from "node:fs/promises";

// 공개 파일만 배포 산출물에 포함합니다. api/는 Vercel이 별도로 번들링합니다.
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const path of ["index.html", "style.css", "app.js", "assets", "services", "data"]) {
  await cp(path, `dist/${path}`, { recursive: true });
}
console.log("정적 파일 빌드 완료: dist/ (서버 코드·환경변수 제외)");

# 腾讯云 SCF 事件函数接入

> 当前新版助手采用此公开接口，不要求访客填写口令。请先部署此函数并验证，再发布新版前端。API Key 继续只保存在云端。

目标入口（用户提供）：https://1513190565-7brz8jtghm.ap-beijing.tencentscf.com

本部署包适配 **事件函数 / Node.js 20.19 / 执行方法 index.main_handler**，与用户提供的旧包说明相同。它不是 Web 函数包，不需要 scf_bootstrap。ZIP 根目录含 index.js、server.mjs、knowledge.mjs、knowledge.json、package.json。

## 修改前

用户原版函数是内部访问版本：检查 FRONTEND_ORIGIN、要求 APP_ACCESS_TOKEN，接收 message 与字符串 context，返回 reply；没有 GET /health。新版公开接口使用 question、结构化 context，返回 answer 和 sources，与旧内测网页不兼容，需要同时升级新版网页。

保留旧 ZIP 以便回滚。新包不读取 APP_ACCESS_TOKEN；公开问答必须由管理员明确设置 PUBLIC_CHAT_ENABLED=true 才启用。启用后任何访客可调用并消耗你的 DeepSeek 额度，不应把旧访问令牌放入网页来伪装鉴权。

## 控制台配置

1. 上传本次的 feiyu-scf-ready.zip（不是用户原始 feiyu-scf-upload.zip），执行方法保持 index.main_handler，Node.js 20.19，函数超时设置为60秒或更高。
2. 保留 DEEPSEEK_API_KEY 原值，无需把密钥发给助手或存到文件。
3. 设置 DEEPSEEK_MODEL=deepseek-flash。
4. 设置 ALLOWED_ORIGINS=https://zliujun36-commits.github.io,http://127.0.0.1:4173（两个 Origin 以英文逗号分隔；不能含 /feiyupinggtai 路径）。本地联调结束可删除 localhost 项。
5. 设置 MAX_REQUESTS_PER_MINUTE=6、MAX_REQUESTS_PER_DAY=200；配置云网关限流/费用告警以及模型余额限制。代码的限流是单实例内存计数，会在冷启动时重置，不是全局账单上限。CORS 不阻止非浏览器程序。
6. 确认允许公众使用你的模型额度后设置 PUBLIC_CHAT_ENABLED=true。原 FRONTEND_ORIGIN 与 APP_ACCESS_TOKEN 可先保留便于回滚，新包不依赖它们。
7. 函数 URL 使用已提供的 HTTPS 入口、现有开放授权，允许 GET/POST/OPTIONS；开启公网出站访问以连接 DeepSeek。新代码自行返回 CORS 响应头；不要在平台层额外添加冲突的 Access-Control-Allow-Origin。
8. 部署并确认函数 URL 指向新代码版本。GET /health 应返回 ready:true。这个结果只表示服务开关和 Key 已配置，仍需实际 POST /chat 验证 Key 有效、模型可用和余额。
9. 网站 dist/agent-config.json 的 endpoint 填入 https://1513190565-7brz8jtghm.ap-beijing.tencentscf.com/chat。验证通过后发布网站。

公网配置会产生模型调用费用，未设置 PUBLIC_CHAT_ENABLED 时新包保持关闭。测试时只问一个简短平台问题，确认返回 answer 与 sources，再开放正常使用。

官方协议：https://cloud.tencent.cn/document/product/583/96099

## 重建 ZIP

在仓库根目录执行 `node scripts/build.mjs` 和 `python scripts/package-tencent-agent.py`。ZIP 不含任何环境变量或密钥。

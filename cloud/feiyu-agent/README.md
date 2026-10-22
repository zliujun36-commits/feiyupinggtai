# 飞域助手云函数

状态：代码与平台知识已准备。需要云账号、DeepSeek Key 和实际部署才能为访客提供 AI 回答。没有内置密钥，没有模拟模型回答。

## 阿里云 Function Compute 部署

1. 本人注册阿里云账号并完成控制台要求的实名流程，开通函数计算。无需购买 ECS 服务器。云函数与模型调用可能产生费用，部署前查看账号价格和设置用量告警。
2. 创建 **Web 函数**，选择支持 **Node.js 20 或更高版本**的自定义运行环境。上传本目录的文件，`server.mjs`、`knowledge.mjs`、`knowledge.json`、`package.json` 必须位于 ZIP 根目录。
3. 启动命令：`node server.mjs`，工作目录 `/code`，监听端口 `9000`。运行环境必须提供对应 Node 可执行文件。代码绑定 `0.0.0.0`，无需 npm 安装依赖。
4. 在函数配置的环境变量中填写 `DEEPSEEK_API_KEY`，设置 `DEEPSEEK_MODEL=deepseek-flash`。不要写进源代码、ZIP、GitHub 或前端。
5. `ALLOWED_ORIGINS=https://zliujun36-commits.github.io`。本地联调时可追加 `,http://127.0.0.1:4173`。浏览器只传提问、有限历史及当前页面指标/详情，不需要访客 Key。
6. 函数允许访问公网以调用 `https://api.deepseek.com`。HTTP 超时至少 60 秒，模型调用超时 45 秒。使用 HTTPS HTTP 触发器；开放 GET、POST、OPTIONS。访客无须登录，但上线前应设置网关限流和云平台费用告警。建议先使用小额 API 余额和低配额联调。
7. 在浏览器打开 HTTPS 函数地址加 `/health`，应返回 `ready:true`；通过 GitHub 页面的实际 POST 请求验证跨域。若平台网关自己处理 OPTIONS，需要同样允许指定 Origin、Content-Type、POST、GET、OPTIONS。
8. 将 `dist/agent-config.json` 的 endpoint 改为 `https://你的函数地址/chat`，构建、提交并推送 GitHub。前端检查 health 成功后启用发送。不得把 Key 填入这个文件。

文档依据：
- https://www.alibabacloud.com/help/zh/functioncompute/creating-a-web-function
- https://help.aliyun.com/zh/functioncompute/must-the-listening-port-of-a-custom-runtime-be-the-same-as-that-of-the-http-server-of-the-custom-runtime
- https://api-docs.deepseek.com/zh-cn/

## 数据与回答范围

运行仓库根目录 `npm run build` 会从平台原始索引、方法资料、空域元信息生成知识文件，并更新网页版本化脚本与样式。知识文件包含 369 个地区的汇总，而不是全部逐点原始明细。逐点问题利用当前已选中对象详情；没有提供的内容明确说明不足。

城市与省份采用确定性查询及汇总，地区排名提供最多十项，文档按词匹配检索四段。复杂跨地区问题、没有命中词的资料或任意历史对话指代可能检索不全，不保证回答全部平台问题。回答带参考资料链接。模型仍可能出错，须核对来源。

## 使用与费用控制

仅放行配置的网页来源，最大请求 24KB、问题 1200 字、六条历史，输出最多 1800 tokens，单实例并发最多 3；默认每来源IP每分钟6次、单实例每天200次。源IP默认用连接地址，可能把同一个网关后的用户合并限流；只有确认网关会覆盖可信转发头后才设 `TRUST_PROXY=true`。

**这些是进程内限制，冷启动会重置，多实例不共享，不能作为全局账单硬上限；CORS 也不是身份认证，非浏览器程序能伪造 Origin。** 对公网开放前，应额外配置云网关的限流/配额或持久化计数，必要时增加人机验证，并在 DeepSeek/云账号配置预算或余额约束。当前实现不保存聊天内容、不记录密钥或上游错误详情。

## 本地验证

在云函数目录设置所需环境变量后执行 `npm start`（默认 9000 端口）。可在仓库运行 `node --test tests/agent.test.mjs`，测试使用模型替身，不发送真实 Key、不产生模型费用。它不代替带真实 Key 的上线联调。

# WeQ 装扮离线索引

独立分发 WeQ 使用的气泡、字体与头像挂件离线索引。完整数据通过 Release 附件分发，不进入 Git 历史。

本仓维护发布工具、格式契约和测试；不保存 QQ 账号、凭据或用户聊天内容。

## 格式与兼容

索引只记录装扮 ID、部件名、CDN 路径和大小，不是字体、图片的完整素材集合。现阶段沿用 `NTDR` v1（protobuf 记录流、Brotli 压缩、AES-CBC），`nativeCommit` 表示读取它所需的 native 密钥来源。独立分发不意味着任意 native 都能解密；WeQ 同时固定 native 与索引清单，不跟随 latest。

Release 包含三份 `dress-{bubble,font,widget}.dat`、`index-manifest.json` 和 `SHA256SUMS`。Git 只保存工具和说明，不接纳 `.dat` 与原始 `*_resources`。

## 本地验证

```sh
node --test test/*.test.mjs
gh release download <明确 native tag> --repo weq-devs/nt_helper_release \
  --pattern manifest.json --pattern 'dress-*.dat' --dir .cache/native
node scripts/stage-release.mjs --native-manifest .cache/native/manifest.json \
  --assets .cache/native --output dist
```

汇总器验证完整 commit、密钥标识、三类资产的名称、格式头、体积和 SHA-256，拒绝链接和已有输出目录。它只原样分发已验证资源，不重新爬取、压缩或加密。

## 发布

手动运行 `Release dress indexes`，填写明确 native tag。默认只预检；关闭 `preflight_only` 才创建新 Release。现阶段更新数据仍先沿用 native 发布生成兼容资源，再在这里独立分发；资源构建与 native commit 的彻底解耦另行迁移。

客户端下载按类别进行，三类文件不再默认进入安装包。已下载素材继续从共享缓存读取，索引更新不会清除用户现有气泡、字体或挂件。

# 部署指南

本文档介绍如何部署修仙世界游戏服务端。

## 环境要求

### 基础环境

| 项目 | 版本要求 |
|------|----------|
| Java | 23+ |
| Maven | 3.8+ |
| MySQL | 8.0+ 或 SQLite |

### 操作系统

- Windows 10+
- Linux (CentOS 7+, Ubuntu 18.04+)
- macOS 10.15+

## 编译项目

### 克隆项目

```bash
git clone https://github.com/oooohhhhhhhhhh/xiuxian-server.git
cd xiuxiangame/main
```

### 编译打包

```bash
mvn clean package
```

编译成功后，JAR 文件位于 `target/` 目录。

## 配置文件

### application.yml

```yaml
server:
  port: 8080

database:
  type: mysql  # 或 sqlite
  url: jdbc:mysql://localhost:3306/xiuxiangame
  username: root
  password: password

auth:
  jwt-secret: your-secret-key
  jwt-expire: 86400

email:
  host: smtp.example.com
  port: 587
  username: email@example.com
  password: email-password

admin:
  username: admin
  password: admin123

onebot:
  enabled: true
  port: 8081
```

### 配置说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `server.port` | HTTP 服务端口 | 8080 |
| `database.type` | 数据库类型 | mysql |
| `database.url` | 数据库连接地址 | - |
| `database.username` | 数据库用户名 | - |
| `database.password` | 数据库密码 | - |
| `auth.jwt-secret` | JWT 密钥 | - |
| `auth.jwt-expire` | JWT 过期时间（秒） | 86400 |
| `onebot.enabled` | 是否启用 OneBot | true |
| `onebot.port` | OneBot 端口 | 8081 |

## 启动服务

### 开发环境

```bash
mvn spring-boot:run
```

### 生产环境

```bash
java -jar target/xiuxiangame-1.0.0.jar
```

### 后台运行（Linux）

```bash
nohup java -jar target/xiuxiangame-1.0.0.jar > logs/app.log 2>&1 &
```

## 数据库配置

### MySQL

1. 创建数据库：
```sql
CREATE DATABASE xiuxiangame CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

2. 数据库连接配置：
```yaml
database:
  type: mysql
  url: jdbc:mysql://localhost:3306/xiuxiangame?useSSL=false&serverTimezone=Asia/Shanghai
  username: root
  password: your-password
```

### SQLite

1. SQLite 不需要额外创建数据库
2. 配置文件：
```yaml
database:
  type: sqlite
  url: jdbc:sqlite:data/xiuxiangame.db
```

## 管理后台

### 访问地址

```
http://localhost:8080/admin
```

### 登录

- 用户名：配置文件中的 `admin.username`
- 密码：配置文件中的 `admin.password`

## QQ 机器人配置

### OneBot 配置

1. 在配置文件中启用 OneBot：
```yaml
onebot:
  enabled: true
```

2. 在 OneBot 客户端中配置 WebSocket 地址：
```
ws://your-server-ip:8081/onebot
```

### 群组配置

通过管理后台或配置文件设置群组：
- 自动禁言开关
- 禁言天数
- 管理员权限

## 常见问题

### 端口被占用

```bash
# 查找占用端口的进程
netstat -ano | findstr :8080

# 杀死进程
taskkill /F /PID <pid>
```

### 数据库连接失败

- 检查数据库服务是否启动
- 检查数据库用户名和密码
- 检查数据库连接地址是否正确

### 邮件发送失败

- 检查邮件服务器配置
- 检查邮箱密码是否正确
- 检查是否启用了 SMTP 服务
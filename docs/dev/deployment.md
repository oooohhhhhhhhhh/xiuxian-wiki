# 部署指南

本文档详细介绍如何部署修仙世界游戏服务端。

## 环境要求

| 项目 | 最低要求 | 推荐配置 |
|------|----------|----------|
| Java | 17 | 21 |
| 内存 | 2GB | 4GB+ |
| 磁盘 | 10GB | 50GB+ |
| 网络 | 1Mbps | 10Mbps+ |

## 安装步骤

### 1. 克隆项目

```bash
git clone https://github.com/oooohhhhhhhhhh/xiuxian-server.git
cd xiuxian-server
```

### 2. 构建项目

```bash
mvn clean package -DskipTests
```

构建完成后，JAR 文件位于 `target/xiuxian-server-1.0.0.jar`。

### 3. 创建配置文件

在运行目录创建 `application.yml`：

```yaml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:sqlite:./data/game.db
    driver-class-name: org.sqlite.JDBC

game:
  name: 修仙世界
  version: 1.0.0
  max-players: 1000
  
  # 邮件配置
  mail:
    enabled: false
    host: smtp.example.com
    port: 587
    username: admin@example.com
    password: password
  
  # QQ机器人配置
  qq:
    enabled: true
    host: localhost
    port: 8080
    access-token: your_access_token

logging:
  level:
    com.mtxgdn: INFO
  file:
    name: ./logs/game.log
```

### 4. 运行服务

```bash
java -jar target/xiuxian-server-1.0.0.jar
```

或者使用 nohup 在后台运行：

```bash
nohup java -jar target/xiuxian-server-1.0.0.jar > game.log 2>&1 &
```

---

## 配置说明

### 服务器配置

```yaml
server:
  port: 8080                    # HTTP端口
  servlet:
    context-path: /api           # API前缀
```

### 数据库配置

支持 SQLite（默认）和 MySQL：

**SQLite（默认）**：
```yaml
spring:
  datasource:
    url: jdbc:sqlite:./data/game.db
    driver-class-name: org.sqlite.JDBC
```

**MySQL**：
```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/xiuxian?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai
    driver-class-name: com.mysql.cj.jdbc.Driver
    username: root
    password: password
```

### 游戏配置

```yaml
game:
  name: 修仙世界                 # 服务器名称
  version: 1.0.0                # 版本号
  max-players: 1000             # 最大在线人数
  
  # 修炼配置
  cultivation:
    base-speed: 10              # 基础修炼速度
    offline-multiplier: 0.5     # 离线修炼效率
  
  # 探索配置
  exploration:
    cooldown-seconds: 60        # 探索冷却时间（秒）
    max-level: 100              # 最大探索等级
  
  # 战斗配置
  combat:
    max-rounds: 50              # 战斗最大回合数
    pvp-enabled: true           # 是否开启PVP
  
  # 经济配置
  economy:
    starting-stones: 1000       # 初始灵石数量
    market-tax: 0.05            # 坊市交易税（5%）
  
  # 宗门配置
  sect:
    max-members: 50             # 宗门最大人数
    creation-cost: 10000        # 创建宗门费用
```

### QQ 机器人配置

```yaml
game:
  qq:
    enabled: true               # 是否启用QQ机器人
    host: localhost             # OneBot服务地址
    port: 8080                  # OneBot服务端口
    access-token: ""            # 访问令牌（可选）
    group-id: 123456789        # 游戏群ID
    admin-qq: 987654321        # 管理员QQ号
```

### 日志配置

```yaml
logging:
  level:
    com.mtxgdn: INFO            # 应用日志级别
    root: WARN                  # 根日志级别
  file:
    name: ./logs/game.log       # 日志文件路径
    max-size: 100MB             # 单文件最大大小
    max-history: 30             # 保留天数
```

---

## 系统服务配置

### systemd 服务

创建 `/etc/systemd/system/xiuxian-server.service`：

```ini
[Unit]
Description=修仙世界游戏服务端
After=network.target

[Service]
Type=simple
User=game
WorkingDirectory=/opt/xiuxian-server
ExecStart=/usr/bin/java -jar xiuxian-server-1.0.0.jar
Restart=always
RestartSec=5
Environment="JAVA_OPTS=-Xms2G -Xmx4G"

[Install]
WantedBy=multi-user.target
```

启用并启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable xiuxian-server
sudo systemctl start xiuxian-server
```

查看日志：

```bash
sudo journalctl -u xiuxian-server -f
```

---

## 安全配置

### 防火墙配置

```bash
# 允许HTTP访问
sudo ufw allow 8080/tcp

# 允许MySQL访问（仅内网）
sudo ufw allow from 192.168.0.0/24 to any port 3306

# 启用防火墙
sudo ufw enable
```

### HTTPS 配置

使用 Nginx 反向代理配置 HTTPS：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /etc/ssl/certs/your-domain.crt;
    ssl_certificate_key /etc/ssl/private/your-domain.key;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 监控

### 服务器状态

```bash
# 查看进程
ps aux | grep xiuxian-server

# 查看端口占用
netstat -tlnp | grep 8080

# 查看内存使用
free -h
```

### 游戏内状态

通过 API 查看服务器状态：

```bash
curl http://localhost:8080/api/game/status
```

---

## 备份

### 数据库备份

```bash
# SQLite
cp ./data/game.db ./data/game.db.backup

# MySQL
mysqldump -u root -p xiuxian > xiuxian_backup.sql
```

### 自动备份脚本

```bash
#!/bin/bash
BACKUP_DIR="/opt/xiuxian-backup"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR
cp /opt/xiuxian-server/data/game.db $BACKUP_DIR/game_$DATE.db

# 保留最近7天备份
find $BACKUP_DIR -name "*.db" -mtime +7 -delete
```

设置 cron 定时任务：

```bash
0 3 * * * /opt/xiuxian-server/backup.sh
```

---

## 常见问题

### Q: 启动时提示端口被占用

```bash
# 查找占用端口的进程
lsof -i :8080
# 或
netstat -tlnp | grep 8080

# 杀死进程
kill -9 <PID>
```

### Q: 数据库连接失败

- 确保数据库服务已启动
- 检查数据库配置文件中的用户名和密码
- 确保数据库存在且有权限访问

### Q: QQ 机器人不响应

- 确保 OneBot 服务已启动并正常运行
- 检查配置文件中的 host 和 port 是否正确
- 确保机器人已加入指定的群聊
- 查看日志文件排查错误

### Q: 内存不足

修改 JVM 参数：

```bash
java -Xms2G -Xmx4G -jar xiuxian-server-1.0.0.jar
```

### Q: 部署到 GitHub Pages

Wiki 文档已配置自动部署到 GitHub Pages，每次 push 到 main 分支会自动触发 Actions 构建并部署。

访问地址：`https://oooohhhhhhhhhh.github.io/xiuxian-wiki/`
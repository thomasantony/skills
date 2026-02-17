---
name: vps-hardening-ubuntu
description: Use when provisioning a fresh Ubuntu VPS, securing a new server, or hardening SSH access on a remote machine. Covers SSH config, SSH hardening, firewall, fail2ban, sysctl, automatic updates, and service cleanup.
---

# VPS Hardening - Ubuntu 22.04+

## Overview

Standard security hardening runbook for a fresh Ubuntu VPS. Covers the full attack surface reduction: SSH lockdown, firewall, brute-force protection, kernel hardening, and service minimization.

**Prerequisite:** Root password for the fresh VPS and its IP address.

## When to Use

- Fresh VPS just provisioned
- Server audit reveals default/unhardened config
- Setting up a new remote machine for any purpose

## Quick Reference

| Layer | Tool | Key Config |
|-------|------|------------|
| Local SSH | ~/.ssh/config | ControlMaster persistent session |
| Packages | apt | `apt update && apt upgrade` |
| SSH | sshd_config.d/ | Key-only auth, no root, extra port |
| Firewall | UFW | Default deny, allow SSH ports only |
| Brute-force | fail2ban | SSH jail, 3 retries, 24h ban |
| Auto-updates | unattended-upgrades | Security origins only |
| Kernel | sysctl | SYN cookies, no redirects, no forwarding |
| Services | systemd | Disable unnecessary services |

## Procedure

Ask the user for: **hostname/alias**, **IP address**, **SSH port** (usually 22), **desired admin username**, and **desired extra SSH port**.

### 0. Set up local SSH config and establish persistent session

Add an entry to `~/.ssh/config` for the new server:

```
Host ALIAS
    HostName IP_ADDRESS
    User root
    Port 22
    ControlPath ~/.ssh/sockets/%r@%h:%p
    ControlMaster auto
    ControlPersist 4h
```

Ensure the sockets directory exists:

```bash
mkdir -p ~/.ssh/sockets
```

Then SSH in using the root password. This establishes a ControlMaster session that persists for 4 hours — all subsequent `ssh ALIAS` commands will multiplex over this connection without requiring a password again.

```bash
ssh ALIAS
# Enter root password when prompted, then exit
```

All remaining steps run commands via `ssh ALIAS "COMMAND"` which reuses this persistent session.

### 1. Update packages

```bash
ssh ALIAS "export DEBIAN_FRONTEND=noninteractive && apt-get update && apt-get upgrade -y"
```

### 2. Create admin user

```bash
ssh ALIAS "useradd -m -s /bin/bash -G sudo USERNAME && echo 'USERNAME:GENERATED_PASSWORD' | chpasswd"
```

Generate a strong random password with `openssl rand -base64 18` and show it to the user.

Install the local SSH public key for both root and the new user:

```bash
# Install key for root (if not already present)
cat ~/.ssh/id_rsa.pub | ssh ALIAS "mkdir -p /root/.ssh && cat >> /root/.ssh/authorized_keys && chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys"

# Copy to new user
ssh ALIAS "mkdir -p /home/USERNAME/.ssh && cp /root/.ssh/authorized_keys /home/USERNAME/.ssh/authorized_keys && chown -R USERNAME:USERNAME /home/USERNAME/.ssh && chmod 700 /home/USERNAME/.ssh && chmod 600 /home/USERNAME/.ssh/authorized_keys"
```

### 3. Harden SSH

Write to `/etc/ssh/sshd_config.d/hardening.conf` (drop-in overrides cleanly):

```
Port 22
Port EXTRA_PORT

PermitRootLogin no
PasswordAuthentication no
PermitEmptyPasswords no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthenticationMethods publickey
MaxAuthTries 3
MaxSessions 3
LoginGraceTime 30

HostbasedAuthentication no
KerberosAuthentication no
GSSAPIAuthentication no

X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
PermitTunnel no
ClientAliveInterval 300
ClientAliveCountMax 2

LogLevel VERBOSE

AllowUsers USERNAME
```

Then comment out conflicting lines in main `/etc/ssh/sshd_config` (e.g. `PermitRootLogin yes`, `X11Forwarding yes`).

```bash
ssh ALIAS "sshd -t"            # Validate config BEFORE restart
ssh ALIAS "systemctl restart sshd"
```

**CRITICAL:** Test new user login on both ports BEFORE closing existing session:

```bash
ssh -o ControlPath=none -i ~/.ssh/id_rsa USERNAME@IP_ADDRESS -p 22 "echo OK"
ssh -o ControlPath=none -i ~/.ssh/id_rsa USERNAME@IP_ADDRESS -p EXTRA_PORT "echo OK"
```

Also verify root login is now denied:

```bash
ssh -o ControlPath=none -i ~/.ssh/id_rsa root@IP_ADDRESS -p 22 "echo SHOULD_NOT_SEE_THIS"
# Should fail with: Permission denied (publickey)
```

After verification, update `~/.ssh/config` to use the new user and add the extra port entry:

```
Host ALIAS
    HostName IP_ADDRESS
    User USERNAME
    Port 22
    ControlPath ~/.ssh/sockets/%r@%h:%p
    ControlMaster auto
    ControlPersist 4h
```

### 4. Configure UFW firewall

```bash
ssh ALIAS "apt-get install -y ufw"
ssh ALIAS "ufw default deny incoming && ufw default allow outgoing && ufw allow 22/tcp comment 'SSH standard' && ufw allow EXTRA_PORT/tcp comment 'SSH alternate' && yes | ufw enable && ufw status verbose"
```

Open additional ports as needed (80/tcp, 443/tcp for web).

### 5. Install fail2ban

```bash
ssh ALIAS "DEBIAN_FRONTEND=noninteractive apt-get install -y fail2ban"
```

Write `/etc/fail2ban/jail.local`:

```ini
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
banaction = ufw

[sshd]
enabled = true
port = 22,EXTRA_PORT
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 24h
```

```bash
ssh ALIAS "systemctl enable fail2ban && systemctl restart fail2ban"
ssh ALIAS "fail2ban-client status sshd"  # Verify jail active
```

### 6. Automatic security updates

```bash
ssh ALIAS "DEBIAN_FRONTEND=noninteractive apt-get install -y unattended-upgrades apt-listchanges"
```

Write `/etc/apt/apt.conf.d/20auto-upgrades`:

```
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
```

Write `/etc/apt/apt.conf.d/50unattended-upgrades`:

```
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
```

### 7. Sysctl hardening

Write `/etc/sysctl.d/99-hardening.conf`:

```ini
# IP spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Disable source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.secure_redirects = 0

# SYN flood protection
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2

# Log martian packets
net.ipv4.conf.all.log_martians = 1

# Ignore broadcast ICMP
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1

# Disable forwarding
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0

# Disable IPv6 router advertisements
net.ipv6.conf.all.accept_ra = 0

# ASLR
kernel.randomize_va_space = 2
```

```bash
ssh ALIAS "sysctl --system"  # fs.protected_* errors normal on VPS containers
```

### 8. Disable unnecessary services and harden misc

```bash
# List running services and disable unneeded ones
ssh ALIAS "systemctl list-units --type=service --state=running --no-pager"
# Common offenders on fresh VPS:
ssh ALIAS "systemctl stop apache2 exim4 xinetd 2>/dev/null; systemctl disable apache2 exim4 xinetd 2>/dev/null"
```

```bash
# Tighten permissions
ssh ALIAS "chmod 700 /root /home/USERNAME"
ssh ALIAS "chmod 600 /etc/crontab && chmod 700 /etc/cron.d /etc/cron.daily /etc/cron.hourly /etc/cron.weekly /etc/cron.monthly 2>/dev/null"
ssh ALIAS "chmod 640 /etc/ssh/sshd_config"

# Disable core dumps
ssh ALIAS 'echo "* hard core 0" >> /etc/security/limits.d/hardening.conf && echo "* soft core 0" >> /etc/security/limits.d/hardening.conf'

# Set login banner
ssh ALIAS 'cat > /etc/issue.net << "EOF"
*******************************************************************
*  WARNING: Unauthorized access to this system is prohibited.     *
*  All connections are monitored and recorded.                    *
*  Disconnect IMMEDIATELY if you are not an authorized user.      *
*******************************************************************
EOF
cp /etc/issue.net /etc/issue'

# Fix locale if needed
ssh ALIAS "locale-gen en_US.UTF-8 && update-locale LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8"
```

## Verification Checklist

Run all of these before declaring complete:

```bash
# Root login blocked
ssh -o ControlPath=none root@IP_ADDRESS "echo fail"  # Should fail

# User works on both ports
ssh -o ControlPath=none USERNAME@IP_ADDRESS -p 22 "echo OK"
ssh -o ControlPath=none USERNAME@IP_ADDRESS -p EXTRA_PORT "echo OK"

# Sudo works (with password)
ssh ALIAS "echo 'PASSWORD' | sudo -S whoami"  # Should print: root

# Firewall active
ssh ALIAS "sudo ufw status verbose"

# fail2ban running
ssh ALIAS "sudo fail2ban-client status sshd"

# Services minimized
ssh ALIAS "systemctl list-units --type=service --state=running --no-pager"
```

## Common Mistakes

- **Locking yourself out:** Always test new user SSH before restarting sshd with root login disabled. Keep the ControlMaster session open.
- **Forgetting AllowUsers:** If you use `AllowUsers`, every user who needs SSH must be listed.
- **UFW blocking yourself:** Always `ufw allow 22/tcp` before `ufw enable`.
- **VPS container limitations:** `fs.protected_*` sysctl errors are normal on OpenVZ/Virtuozzo containers; those params are host-managed.
- **fail2ban banaction:** Must match your firewall. Use `ufw` if using UFW, not default `iptables`.
- **ControlMaster expiry:** The persistent session lasts 4 hours. If it expires mid-hardening before key auth is set up, you'll need to re-enter the password.

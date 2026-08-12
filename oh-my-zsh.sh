#!/bin/bash
set -e

# 显示用法
usage() {
    cat <<EOF
Usage: $0 [full|config]

Modes:
  full    (default) Install Oh My Zsh, clone plugins/themes, and update .zshrc.
  config  Only clone/update plugins/themes and update .zshrc (Oh My Zsh must exist).

Examples:
  $0          # same as full
  $0 config   # configuration-only mode
EOF
    exit 1
}

# 解析模式
MODE="${1:-full}"
if [[ "$MODE" != "full" && "$MODE" != "config" ]]; then
    usage
fi

# 检查必备命令
for cmd in zsh git curl; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "Error: $cmd is not installed. Please install it first."
        exit 1
    fi
done

# 设置目录
ZSH="${ZSH:-$HOME/.oh-my-zsh}"
ZSH_CUSTOM="${ZSH_CUSTOM:-$ZSH/custom}"

# ---- 安装 Oh My Zsh（仅 full 模式） ----
install_ohmyzsh() {
    if [[ -d "$ZSH" ]]; then
        echo "Oh My Zsh already installed at $ZSH"
    else
        echo "Installing Oh My Zsh (unattended)..."
        sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
    fi
}

# ---- 克隆/更新插件和主题 ----
clone_plugins() {
    echo "Cloning/updating plugins and themes..."
    mkdir -p "$ZSH_CUSTOM"/{plugins,themes}

    # zsh-autosuggestions
    if [[ -d "${ZSH_CUSTOM}/plugins/zsh-autosuggestions" ]]; then
        (cd "${ZSH_CUSTOM}/plugins/zsh-autosuggestions" && git pull)
    else
        git clone https://github.com/zsh-users/zsh-autosuggestions "${ZSH_CUSTOM}/plugins/zsh-autosuggestions"
    fi

    # zsh-syntax-highlighting
    if [[ -d "${ZSH_CUSTOM}/plugins/zsh-syntax-highlighting" ]]; then
        (cd "${ZSH_CUSTOM}/plugins/zsh-syntax-highlighting" && git pull)
    else
        git clone https://github.com/zsh-users/zsh-syntax-highlighting.git "${ZSH_CUSTOM}/plugins/zsh-syntax-highlighting"
    fi

    # oh-my-via theme
    if [[ -d "${ZSH_CUSTOM}/themes/oh-my-via" ]]; then
        (cd "${ZSH_CUSTOM}/themes/oh-my-via" && git pull)
    else
        git clone https://github.com/badouralix/oh-my-via.git "${ZSH_CUSTOM}/themes/oh-my-via"
    fi
}

# ---- 更新 .zshrc ----
update_zshrc() {
    local zshrc="$HOME/.zshrc"
    if [[ ! -f "$zshrc" ]]; then
        echo "Warning: $zshrc not found. Creating a new one."
        touch "$zshrc"
    fi

    # 备份
    backup="${zshrc}.bak.$(date +%Y%m%d%H%M%S)"
    cp "$zshrc" "$backup"
    echo "Backup created at $backup"

    # 更新 ZSH_THEME
    if grep -q '^ZSH_THEME=' "$zshrc"; then
        sed -i'.bak' 's/^ZSH_THEME=.*/ZSH_THEME="oh-my-via\/via"/' "$zshrc"
        echo "Updated ZSH_THEME."
    else
        echo 'ZSH_THEME="oh-my-via/via"' >> "$zshrc"
        echo "Added ZSH_THEME."
    fi

    # 更新 plugins（替换整行或追加）
    plugins_line='plugins=(
    git
    zsh-autosuggestions
    zsh-syntax-highlighting
)'
    if grep -q '^plugins=(' "$zshrc"; then
        # 替换原有 plugins 行（注意：只匹配以 plugins=( 开头的行，若跨行可能不完美，但绝大多数为单行）
        sed -i'.bak' "/^plugins=(/c\\$plugins_line" "$zshrc"
        echo "Updated plugins."
    else
        echo "$plugins_line" >> "$zshrc"
        echo "Added plugins."
    fi

    echo ".zshrc updated successfully."
}

# ---- 主流程 ----
if [[ "$MODE" == "full" ]]; then
    install_ohmyzsh
    clone_plugins
    update_zshrc
else
    # config 模式：必须已有 Oh My Zsh
    if [[ ! -d "$ZSH" ]]; then
        echo "Error: Oh My Zsh not found at $ZSH. Please run full mode first."
        exit 1
    fi
    clone_plugins
    update_zshrc
fi

echo "All done! Please restart your terminal or run 'exec zsh' to apply changes."
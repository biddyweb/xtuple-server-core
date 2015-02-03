#!/bin/bash

set -o pipefail

logfile=$(pwd)/bootstrap.log
REQNODEV=v0.11.13

install_debian () {
  log "Checking Operating System..."
  dist=$(lsb_release -sd)
  version=$(lsb_release -sr)
  animal=$(lsb_release -sc)
  
  [[ $dist =~ 'Ubuntu' || $dist =~ 'Debian' ]] || die "$dist linux distribution not supported"
  [[ $version =~ '12.04' || $version =~ '14.04' || $version =~ '7.7' ]] || die "$dist version not supported"

  log "Upgrading/Removing existing packages..."
  apt-get -qq update |& tee -a $logfile  || die "Could not update package lists"

  # do not run upgrade in CI environment
  if [[ -z $TRAVIS ]]; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" --force-yes upgrade \
      |& tee -a $logfile
  fi

  apt-get -qq purge ^nodejs --force-yes > /dev/null 2>&1
  apt-get -qq purge ^npm --force-yes > /dev/null 2>&1
  apt-get -qq purge ^postgres --force-yes > /dev/null 2>&1
  
  if [[ $version =~ '12.04' ]]; then
    log "Adding custom Debian repositories for Ubuntu 12.04..."
    apt-get -qq install python-software-properties --force-yes

    if [[ ! $(grep -Fxq pgdg /etc/apt/sources.list) && ! $(grep -Fxq pgdg /etc/apt/sources.list.d/pgdg.list) ]]; then
      wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - > /dev/null 2>&1
      echo "deb http://apt.postgresql.org/pub/repos/apt/ precise-pgdg main" | tee /etc/apt/sources.list.d/pgdg.list 2>&1
    fi

    add-apt-repository ppa:nginx/stable -y > /dev/null 2>&1
    add-apt-repository ppa:git-core/ppa -y > /dev/null 2>&1
  fi
  
  if [[ $version =~ '7.7' ]]; then
    log "Adding custom Debian repositories for Debian 7.7 ..."

    if [[ ! $(grep -Fxq pgdg /etc/apt/sources.list) && ! $(grep -Fxq pgdg /etc/apt/sources.list.d/pgdg.list) ]]; then
      wget -qO- https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add - > /dev/null 2>&1
      echo "deb http://apt.postgresql.org/pub/repos/apt/ wheezy-pgdg main" | tee /etc/apt/sources.list.d/pgdg.list 2>&1
    fi

    # adds wheezy-backports in order to get newer versions of git and nginx
    if [[ ! $(grep -Fxq backports /etc/apt/sources.list) && ! $(grep -Fxq backports /etc/apt/sources.list.d/backports.list) ]]; then
      echo "deb http://http.debian.net/debian wheezy-backports main" | tee /etc/apt/sources.list.d/backports.list 2>&1
    fi
  fi

  log "Updating package lists..."
  apt-get -qq update |& tee -a $logfile  || die "Could not update package lists"

  log "Installing Packages (this will take a few minutes)..."

  if [[ $version =~ '12.04' || $version =~ '14.04' ]]; then
    apt-get -qq install \
      git-core nginx-full \
      --force-yes |& tee -a $logfile > /dev/null 2>&1
  elif [[ $version =~ '7.7' ]]; then
    apt-get -qq install -t wheezy-backports \
      git nginx-full \
      --force-yes | tee -a $logfile > /dev/null 2>&1
  fi

  apt-get -qq install \
    curl build-essential libssl-dev openssh-server cups \
    apache2-utils vim xvfb \
    postgresql-$XT_PG_VERSION postgresql-server-dev-$XT_PG_VERSION \
    postgresql-contrib-$XT_PG_VERSION postgresql-$XT_PG_VERSION-plv8 \
    libavahi-compat-libdnssd-dev \
    perl libnet-ssleay-perl openssl libauthen-pam-perl libpam-runtime \
    libio-pty-perl apt-show-versions python \
    --force-yes |& tee -a $logfile > /dev/null 2>&1

  log "Cleaning up packages..."
  apt-get -qq autoremove --force-yes > /dev/null 2>&1
}

install_openrpt() {
  local STARTDIR=$PWD
  local WORKINGDIR=${TMPDIR:-/tmp}

  apt-get -qq install openrpt --force-yes
  if DISPLAY=:-1 rptrender --help | grep -q rptrender ; then
    # if rptrender supports --help, it supports the other options we need, too
    log "OpenRPT package will suffice"
  else
    [ -d $WORKINGDIR ] || mkdir -p $WORKINGDIR || die "Couldn't mkdir $WORKINGDIR"
    cd $WORKINGDIR                             || die "Couldn't cd $WORKINGDIR"

    log "preparing to build OpenRPT from source:-("
    rm -rf openrpt
    git clone -q https://github.com/xtuple/openrpt.git |& \
                                    tee -a $logfile || die "Can't clone openrpt"
    apt-get install -qq --force-yes qt4-qmake libqt4-dev libqt4-sql-psql |& \
                                    tee -a $logfile || die "Can't install Qt"
    cd openrpt                                      || die "Can't cd openrpt"
    OPENRPT_VER=master #TODO: OPENRPT_VER=`latest stable release`
    git checkout -q $OPENRPT_VER |& tee -a $logfile || die "Can't checkout openrpt"
    log "Starting OpenRPT build (this will take a few minutes)..."
    qmake                        |& tee -a $logfile || die "Can't qmake openrpt"
    make > /dev/null             |& tee -a $logfile || die "Can't make openrpt"
    mkdir -p /usr/local/bin                         || die "Can't make /usr/local/bin"
    mkdir -p /usr/local/lib                         || die "Can't make /usr/local/lib"
    tar cf - bin lib | tar xf - -C /usr/local       || die "Can't install OpenRPT"
    ldconfig                     |& tee -a $logfile || die "ldconfig failed"
  fi

  cd $STARTDIR || die "Couldn't return to $STARTDIR"
}

install_node () {
  rm -rf ~/.npm ~/tmp ~/.nvm /root/.npm /root/tmp
  mkdir -p /usr/local/{share/man,bin,lib/node,lib/node_modules,include/node,n/versions}

  log "Installing n..."
  wget https://raw.githubusercontent.com/visionmedia/n/master/bin/n -qO n
  chmod +x n
  mv n /usr/bin/n

  log "Installing node..."
  n 0.8 > /dev/null 2>&1
  n 0.10 > /dev/null 2>&1
  n 0.11.13 > /dev/null 2>&1

  for GLOBALPKG in npm@1.4.28 nex bower ; do
    log "Installing $GLOBALPKG ..."
    npm install -g $GLOBALPKG --quiet |& tee -a $logfile || die "Could not install $GLOBALPKG"
  done

  echo "export NODE_PATH=/usr/local/lib/node_modules" > /etc/profile.d/nodepath.sh
  update-locale LANG=en_US.UTF-8
  update-locale LC_ALL=en_US.UTF-8

  chmod -Rf 777 /usr/local/{share/systemtap,share/man,bin,lib/node*,include/node*,n*}
  rm -rf ~/.npm ~/tmp /root/.npm /root/tmp
}

setup () {
  #pg_dropcluster 9.3 main --stop > /dev/null 2>&1

  # TODO solve
  chmod -R 777 /var/run/postgresql

  rm -f /etc/nginx/sites-available/default
  rm -f /etc/nginx/sites-enabled/default
}

log() {
  local DATE=$(date +%H:%M:%S)
  local NODEV=$(node --version 2>/dev/null)
  echo -e "[xtuple $DATE $NODEV] $@"
  echo -e "[xtuple $DATE $NODEV] $@" >> $logfile
}
die() {
  TRAPMSG="$@"
  log $@
  exit 1
}

trap 'CODE=$? ; log "\n\nxTuple bootstrap Aborted:\n  line: $BASH_LINENO \n  cmd: $BASH_COMMAND \n  code: $CODE\n  msg: $TRAPMSG\n" ; exit 1' ERR

[ $(id -u) -eq 0 ] || die "You must run this script as root"

if [[ -z $XT_PG_VERSION ]]; then
  export XT_PG_VERSION="9.3"
fi

log "This program will install and configure the system dependencies for xTuple."
log ""
log "         xxx     xxx"
log "          xxx   xxx "
log "           xxx xxx  "
log "            xxxxx   "
log "           xxx xxx  "
log "          xxx   xxx "
log "         xxx     xxx\n"

if [[ ! -z $(which apt-get) ]]; then
  install_debian
  install_openrpt
  install_node
  setup
  echo ''
else
  log "apt-get not found."
  exit 1
fi

if [ $(node --version) != $REQNODEV ] ; then
  log "Switching node from version $(node --version) to $REQNODEV"
  n $REQNODEV
fi


log "Done! You now have yourself a bona fide xTuple Server."
log "We recommend that you reboot the machine now"
rm -f bootstrap.sh
exit 0

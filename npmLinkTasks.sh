#!/bin/bash

PROG=$(basename $0)
XTSLIBDIR=lib
STARTDIR=$(pwd)

function die {
  [ $# -gt 0 ] && echo $PROG: $*
  exit 1
}

if [ $(basename $STARTDIR) != xtuple-server-core ] ; then
  if [ -d ../xtuple-server-core/lib ] ; then
    XTSLIBDIR=../xtuple-server-core/lib
  else
    die cannot find xtuple-server-core/lib
  fi
fi

for TASKDIR in $(echo tasks/*/*) ; do
  cd $TASKDIR              || die
  npm link $STARTDIR/lib   || die
  cd $STARTDIR             || die
done

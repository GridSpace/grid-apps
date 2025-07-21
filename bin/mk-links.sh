#!/bin/bash

find src/ web/ -type l | while read link; do echo "$link,$(readlink "$link")"; done > conf/links.csv

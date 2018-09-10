import os

##########################################################################
##########################################################################
#
# Find calls to play_sound or play_sound2, pull out the argument bytes
# (that follow the jsr), and collate them. Though I'm still none the
# wiser.
# 
##########################################################################
##########################################################################

if os.getenv("INSIDE_EMACS") is not None and os.getenv("USER")=="tom":
    os.chdir(os.path.expanduser("~/github/exile_disassembly"))

##########################################################################
##########################################################################
    
def main():
    with open("./tmp/exileb.new","rb") as f: data=[ord(x) for x in f.read()]

    play_sound=0x13fa
    play_sound2=0x13f8
    num_sounds=0

    values=[set(),set(),set(),set()]

    offset=0
    while offset<len(data)-7:
        if data[offset]==0x20:
            target=data[offset+1]|(data[offset+2]<<8)
            offset+=3
            if target==play_sound or target==play_sound2:
                type="play_sound" if target==play_sound else "play_sound2"
                sound_data=data[offset:offset+4]
                print "$%04X: %02x %02x %02x %02x (%s)"%(0x100+offset,
                                                         sound_data[0],
                                                         sound_data[1],
                                                         sound_data[2],
                                                         sound_data[3],
                                                         type)
                for i in range(4): values[i].add(sound_data[i])
                num_sounds+=1
                offset+=4
        else: offset+=1

    print "%d sound(s)"%num_sounds
    for i in range(4): print "    %d: %s"%(i,sorted(list(values[i])))

    # for i in range(256):
    #     if i>=0xb6: code=(i-0x80)*8
    #     elif i>=0x84: code=(i-0x4a)*4
    #     elif i>=0x40: code=(i-0x10)*2
    #     else: code=(i-0xe0)&0xff

    #     freq=4000000/(32*code)

    #     print "$%02x - $%03x, %dHz"%(i,code,freq)

if __name__=="__main__": main()

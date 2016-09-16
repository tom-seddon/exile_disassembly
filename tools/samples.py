import os,os.path,subprocess

# os.chdir(os.path.expanduser("~/github/exile_disassembly"))

with open("../exilesr.orig","rb") as f: data=[ord(x) for x in f.read()]

# strip off 6502 code
data=data[0x84:]

for sample_id in range(7):
    index=data[sample_id*2+0]+data[sample_id*2+1]*256
    addr=0x8100+index
    print "%d: 0x%04x"%(sample_id,addr)

    sample=[]

    while index<len(data):
        smp_byte=data[index]
        # print "    0x%04x: %-3d %02x"%(index+0x8100,smp_byte,smp_byte)
        index+=1
        if smp_byte==0: break

        if (smp_byte&15)==15:
            sample+=smp_byte*[0]
        else:
            sample+=(smp_byte>>4)*[0]
            sample+=(smp_byte&15)*[127]
                
    print len(sample)

    with open(os.path.join("./tmp.raw"),"wb") as f: f.write("".join([chr(x) for x in sample]))

    cmdline="sox -e signed -r 7813 -b 8 -c 1 tmp.raw %d.wav"%sample_id
    print cmdline
    
    os.system(cmdline)
    os.unlink("./tmp.raw")
    

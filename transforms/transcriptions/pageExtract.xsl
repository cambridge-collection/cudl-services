<?xml version="1.0"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="2.0"
    xmlns:tei="http://www.tei-c.org/ns/1.0" 
    xmlns:xs="http://www.w3.org/2001/XMLSchema"        
    xmlns:util="http://cudl.lib.cam.ac.uk/xtf/ns/util"
     exclude-result-prefixes="#all">
    <xsl:output method="xml" version="1.0" encoding="UTF-8" indent="no"/>

    <!--largely stolen from Mike Hawkins, Newton Project-->

    <xsl:param name="extract">true</xsl:param>


    <!--
        if you only want one page, these should be the same
        if they are blank, the whole document will be returned
    -->
    <xsl:param name="start"/>
    <xsl:param name="end"/>
    <!--for type of text you want returned-->
    <xsl:param name="type"/>


    <xsl:function name="util:has-valid-context">
        <xsl:param name="context"/>
        
        <!-- Presume that if @next contains content that it's accurate to increase excecution speed of script -->
        <xsl:value-of select="exists($context[normalize-space(@next)!=''])
            or exists($context[normalize-space(@prev)!=''])
            or exists($context[not(ancestor::tei:add | ancestor::tei:note)
            and
            not(preceding::tei:addSpan/replace(normalize-space(@spanTo), '#', '')
            = following::tei:anchor/@xml:id)])"/>
    </xsl:function>
    
    <!--id of the start page-->
    <xsl:variable name="startPage">
        
        <xsl:variable name="starting_point" select="
            if ($type='translation') 
            then (//tei:div[@type='translation']//tei:pb[@n=$start][util:has-valid-context(.)])[1] 
            else (//tei:pb[@n = $start][not(ancestor::tei:div[@type='translation'])][util:has-valid-context(.)])[1]"/>
        
        <xsl:choose>
            <xsl:when test="$starting_point[normalize-space(@next)!='']">
                <xsl:value-of select="$starting_point[normalize-space(@next)!='']/@xml:id"/>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="$starting_point/@xml:id"/>
            </xsl:otherwise>
        </xsl:choose>

    </xsl:variable>
    
    <!--
        id of of the pb element indicating the end of the 
        requested page and the start of the next one
    -->
    <xsl:variable name="endPage">
        <!--
            This whole section needs to be checked to ensure
            that it doesn't break anything.
        -->
        
        <!-- This variable does two things:
            1) ensure you are using the pb from the right containing div
            2) only return one result.
            
            NB: @n will *not* be distinct in many manuscripts. 
            The addition of the checks in util:has-valid-context 
            should help mitigate the problem since it excludes the 
            other places where pbs could occur, like inside extended 
            notes written on the page, inline additions that span 
            more than one page, etc. However, it's likely not 100%
            fool-proof. There may be contexts that I haven't anticipated
            and, possibly, might not be able to compensate for. The 
            most durable way to ensure that you are grabbing the right
            pb is to rely on @xml:id but this would require major 
            architectural changes to services and that might not be 
            feasible for a few really-specific edge cases. I think the 
            best approach is to wait and see.
        -->
        <xsl:variable name="starting_point" select="
            if ($type='translation') 
            then (//tei:div[@type='translation']//tei:pb[@n=$end][util:has-valid-context(.)])[1] 
            else (//tei:div[not(@type='translation')]//tei:pb[@n = $end][util:has-valid-context(.)])[1]"/>
        
        <xsl:choose>
            <xsl:when test="$starting_point[@next]">
                <xsl:value-of select="$starting_point[@next]/replace(@next,'^#','')"/>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="
                    ($starting_point/following::tei:pb
                    [util:has-valid-context(.)]
                    )[1]/@xml:id"/>
            </xsl:otherwise>
        </xsl:choose>

    </xsl:variable>


    <xsl:variable name="transcriber">

        <xsl:value-of select="//tei:respStmt[tei:resp='transcriber']/tei:orgName"/>

    </xsl:variable>

    <xsl:key name="pbs" match="//*[@xml:id]" use="@xml:id"/>
    
    <xsl:template match="/">
        <xsl:choose>

            <!--is this a paginated text?-->
            <xsl:when test="normalize-space($startPage)">

                <xsl:apply-templates select="." mode="page"/>

            </xsl:when>
            <!--or a non-paginated one?-->
            <xsl:otherwise>

                <all>

                <!--extracts the whole thing-->
                <!--this is currently just for darwin correspondence stuff-->
                <!--<xsl:copy-of select="//letdata"/>-->


                <xsl:copy-of select="/"/>

                </all>

            </xsl:otherwise>
        </xsl:choose>


    </xsl:template>


    <!--templates for extracting by page-->
    <!--if we start using for darwin correspondence, we may have to * the tei bits-->
    <xsl:template match="*[@xml:id=$startPage]" mode="page">
        <xsl:if test="/tei:TEI/tei:teiHeader/tei:fileDesc/tei:publicationStmt/tei:publisher[matches(.,'Casebooks Project')]">
            <xsl:copy-of select="/tei:TEI/tei:teiHeader/tei:fileDesc/tei:publicationStmt/tei:publisher"/>
        </xsl:if>
        <xsl:if test="normalize-space($transcriber)">
            <transcriber>
                <xsl:value-of select="$transcriber"/>
            </transcriber>

        </xsl:if>


        <xsl:copy-of select="."/>
    </xsl:template>

    <xsl:template match="text()[. >> key('pbs',$endPage)[1] or . &lt;&lt; key('pbs', $startPage)[1]]" mode="page"/>
    
    <xsl:template match="text()[. &lt;&lt; key('pbs',$endPage)[1] and . >> key('pbs',$startPage)[1]]" mode="page">
        <xsl:copy-of select="."/>
    </xsl:template>
    
    <xsl:template match="*[descendant::*[@xml:id=$startPage or @xml:id=$endPage]]" mode="page">
        <xsl:copy>
            <xsl:copy-of select="@*"/>
            <xsl:apply-templates mode="page"/>
        </xsl:copy>
    </xsl:template>

    <xsl:template match="*" mode="page">
        <xsl:choose>
            <xsl:when
                test=". >> key('pbs',$startPage)[1] and(. &lt;&lt; key('pbs',$endPage)[1] or $endPage='')">
                <xsl:copy-of select="."/>
            </xsl:when>
        </xsl:choose>
    </xsl:template>
    
    <xsl:template match="/*/tei:teiHeader|/*/tei:teiHeader//*[not(self::tei:msItem)]|/*/tei:facsimile|*[ancestor::tei:surface]" mode="page">
        <xsl:copy>
            <xsl:copy-of select="@*" />
            <xsl:apply-templates mode="#current" />
        </xsl:copy>
    </xsl:template>
    
    <xsl:template match="tei:msItem[not(@from = $start)]" mode="page" />
    
    <xsl:template match="text()[ancestor::tei:teiHeader]" priority="1" mode="page">
        <xsl:copy-of select="." />
    </xsl:template>
    
    <!--<xsl:template match="tei:surface[not(@xml:id = $startPage)]" mode="page"/>-->
    
    <xsl:variable name="start_surface" select="id($startPage)/replace(@facs,'^#','')"/>
    <xsl:variable name="end_surface" select="(id($endPage)/replace(@facs,'^#',''),(//tei:surface)[last()]/@xml:id)[1]"/>
    
    <xsl:template match="tei:surface[@xml:id = ($start_surface)]|tei:surface[. >> id($start_surface) and . &lt;&lt; id($end_surface)]" mode="page">
        <!--<xsl:message select="$end_surface"></xsl:message>-->
        <xsl:copy>
            <xsl:copy-of select="@*" />
            <xsl:apply-templates mode="#current" />
        </xsl:copy>
    </xsl:template>
</xsl:stylesheet>

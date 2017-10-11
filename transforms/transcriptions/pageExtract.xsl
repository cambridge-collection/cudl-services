<?xml version="1.0"?>
<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="2.0"
    xmlns:tei="http://www.tei-c.org/ns/1.0"
     exclude-result-prefixes="tei">
    <xsl:output method="xml" version="1.0" encoding="UTF-8" indent="no"/>

    <!--largely stolen from Mike Hawkins, Newton Project-->

    <xsl:param name="extract">true</xsl:param>


    <!--if you only want one page, these should be the same
    if they are blank, the whole document will be returned-->
    <xsl:param name="start"/>
    <xsl:param name="end"/>
    <!--for type of text you want returned-->
    <xsl:param name="type"/>

    <!--id of the start page-->
    <xsl:variable name="startPage">

        <xsl:choose>
            <!--default is transcription-->
            <xsl:when test="$type='transcription' or $type=''">

                <xsl:value-of select="//tei:div[not(@type)]//tei:pb[@n=$start]/@xml:id"/>

            </xsl:when>
            <xsl:when test="$type='translation'">

                <xsl:value-of select="//tei:div[@type='translation']//tei:pb[@n=$start]/@xml:id"/>

            </xsl:when>

        </xsl:choose>

    </xsl:variable>



    <!--id of of the next pb element-->
    <xsl:variable name="endPage">

        <xsl:choose>
            <!--default is transcription-->
            <xsl:when test="$type='transcription' or $type=''">

                <xsl:value-of select="//tei:div[not(@type)]//tei:pb[@n=$end]/following::tei:pb[1]/@xml:id"/>

            </xsl:when>
            <xsl:when test="$type='translation'">

                <xsl:value-of select="//tei:div[@type='translation']//tei:pb[@n=$end]/following::tei:pb[1]/@xml:id"/>

            </xsl:when>

        </xsl:choose>

    </xsl:variable>


    <xsl:variable name="transcriber">

        <xsl:value-of select="//tei:respStmt[tei:resp='transcriber']/tei:orgName"/>

    </xsl:variable>

    <xsl:template match="/">

        <xsl:choose>

            <!--is this a paginated text?-->
            <xsl:when test="normalize-space($startPage)">

                <xsl:apply-templates mode="page"/>

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

    <xsl:template match="text()[preceding::*[@xml:id=$endPage]]" mode="page"/>
    <xsl:template match="text()[following::*[@xml:id=$startPage]]" mode="page"/>
    <xsl:template match="text()[following::*[@xml:id=$endPage] and preceding::*[@xml:id=$startPage]]" mode="page">
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
                test="preceding::*[@xml:id=$startPage] and(following::*[@xml:id=$endPage] or $endPage='')">
                <xsl:copy-of select="."/>
            </xsl:when>
        </xsl:choose>
    </xsl:template>


</xsl:stylesheet>
